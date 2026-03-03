import type { Pool } from 'pg';
import type { IVectorDatabase } from '../interfaces/IVectorDatabase';
import type { CodeVector } from '../models/CodeChunk';
import type { RAGQueryFilters, SemanticSearchResult } from '../models/RAGQuery';
import { getPool } from '../db/connection';
import { runMigrations } from '../db/migrations';
import * as queries from '../db/queries';
import type { ChunkRow } from '../db/queries';

export interface HybridSearchOptions {
  lexicalK?: number;
  vectorK?: number;
  finalK?: number;
  lexicalWeight?: number;
}

/**
 * PostgresVectorDatabase
 * Implements IVectorDatabase backed by Postgres + pgvector
 * with hybrid search (FTS + vector) and repo-aware operations
 */
export class PostgresVectorDatabase implements IVectorDatabase {
  readonly name = 'postgres';

  private pool: Pool;
  private embeddingDimensions: number;
  private initialized = false;
  private bm25Available: boolean | null = null;
  private searchEngine: 'bm25' | 'fts';

  constructor(config: { embeddingDimensions?: number; searchEngine?: 'bm25' | 'fts' } = {}) {
    this.pool = getPool();
    this.embeddingDimensions = config.embeddingDimensions || 1024;
    this.searchEngine = config.searchEngine || 'fts';
  }

  async initialize(_projectId: string): Promise<void> {
    if (this.initialized) return;
    await runMigrations(this.pool, this.embeddingDimensions);

    // Check BM25 availability if configured
    if (this.searchEngine === 'bm25') {
      this.bm25Available = await queries.isBM25Available(this.pool);
    }

    this.initialized = true;
  }

  async upsert(vector: CodeVector): Promise<void> {
    await this.upsertBatch([vector]);
  }

  async upsertBatch(vectors: CodeVector[]): Promise<void> {
    const chunks = vectors.map(v => ({
      repo: v.metadata.repo || 'default',
      path: v.filePath,
      language: v.metadata.language,
      symbol: v.metadata.symbol,
      chunkType: v.metadata.chunkType,
      startLine: v.metadata.startLine,
      endLine: v.metadata.endLine,
      content: v.content,
      embedding: v.embedding,
      contentHash: v.contentHash || '',
    }));
    await queries.upsertChunks(this.pool, chunks);
  }

  async search(
    queryVector: number[],
    topK: number,
    filters?: RAGQueryFilters
  ): Promise<SemanticSearchResult[]> {
    const repos = filters?.repos || ['default'];
    const rows = await queries.vectorSearch(this.pool, queryVector, repos, topK);
    return rows.map(row => this.rowToResult(row, 'vector'));
  }

  /**
   * Hybrid search: execute lexical/BM25 + vector in parallel, merge with RRF
   */
  async hybridSearch(
    queryText: string,
    queryVector: number[],
    repos: string[],
    options: HybridSearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    const lexicalK = options.lexicalK ?? 30;
    const vectorK = options.vectorK ?? 30;
    const finalK = options.finalK ?? 10;

    // Choose lexical search strategy: BM25 if available, else ts_rank_cd
    const lexicalSearchFn = this.bm25Available
      ? queries.bm25Search
      : queries.lexicalSearch;

    const [lexResults, vecResults] = await Promise.all([
      lexicalSearchFn(this.pool, queryText, repos, lexicalK),
      queries.vectorSearch(this.pool, queryVector, repos, vectorK),
    ]);

    return this.mergeWithRRF(lexResults, vecResults, finalK);
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const numIds = ids.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
    if (numIds.length > 0) {
      await this.pool.query(
        `DELETE FROM chunks WHERE id = ANY($1)`,
        [numIds]
      );
    }
  }

  async deleteByFilePath(filePath: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM chunks WHERE path = $1`,
      [filePath]
    );
  }

  async clear(): Promise<void> {
    await queries.clearAll(this.pool);
  }

  async count(): Promise<number> {
    return queries.countActiveChunks(this.pool);
  }

  async get(id: string): Promise<CodeVector | null> {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return null;

    const { rows } = await this.pool.query(
      `SELECT * FROM chunks WHERE id = $1`,
      [numId]
    );
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: String(row.id),
      filePath: row.path,
      content: row.content,
      embedding: row.embedding,
      metadata: {
        startLine: row.start_line,
        endLine: row.end_line,
        language: row.language,
        symbol: row.symbol,
        chunkType: row.chunk_type,
        repo: row.repo,
        fileType: '',
        directory: '',
      },
      contentHash: row.content_hash,
      isActive: row.is_active,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { rows } = await this.pool.query('SELECT 1 as ok');
      return rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // Pool is shared, don't close here
  }

  // --- Repo-aware operations ---

  async deactivateByRepoAndPath(repo: string, relPath: string): Promise<number> {
    return queries.deactivateByRepoAndPath(this.pool, repo, relPath);
  }

  async upsertRepoState(repo: string, repoPath: string, commit: string): Promise<void> {
    return queries.upsertRepoState(this.pool, repo, repoPath, commit);
  }

  async getRepoState(repo: string) {
    return queries.getRepoState(this.pool, repo);
  }

  async getRepoChunkCounts() {
    return queries.getRepoChunkCounts(this.pool);
  }

  // --- Merge algorithm: Reciprocal Rank Fusion ---

  /**
   * Merge lexical and vector results using Reciprocal Rank Fusion (RRF).
   * RRF is score-agnostic — it only uses rank positions, avoiding the
   * max-normalization bias that made long documents (CHANGELOGs) dominate.
   *
   * Formula: RRF_score(doc) = Σ 1/(k + rank_i) for each result set
   * where k=60 is the standard smoothing constant.
   */
  private mergeWithRRF(
    lex: ChunkRow[],
    vec: ChunkRow[],
    finalK: number
  ): SemanticSearchResult[] {
    const RRF_K = 60;

    const byId = new Map<number, ChunkRow & { rrfScore: number; source: 'lexical' | 'vector' | 'hybrid' }>();

    // Lexical results: rank is the array position (0-based)
    for (let rank = 0; rank < lex.length; rank++) {
      const h = lex[rank];
      byId.set(h.id, {
        ...h,
        rrfScore: 1 / (RRF_K + rank + 1),
        source: 'lexical',
      });
    }

    // Vector results: add RRF score, mark as hybrid if already present
    for (let rank = 0; rank < vec.length; rank++) {
      const h = vec[rank];
      const rrfContribution = 1 / (RRF_K + rank + 1);

      if (byId.has(h.id)) {
        const existing = byId.get(h.id)!;
        existing.rrfScore += rrfContribution;
        existing.source = 'hybrid';
      } else {
        byId.set(h.id, {
          ...h,
          rrfScore: rrfContribution,
          source: 'vector',
        });
      }
    }

    const sorted = [...byId.values()].sort((a, b) => b.rrfScore - a.rrfScore);
    return sorted.slice(0, finalK).map(row => this.rowToResult(
      { ...row, score: row.rrfScore },
      row.source
    ));
  }

  private rowToResult(row: ChunkRow, source: 'lexical' | 'vector' | 'hybrid'): SemanticSearchResult {
    return {
      filePath: row.path,
      content: row.content,
      similarity: row.score,
      metadata: {
        startLine: row.start_line,
        endLine: row.end_line,
        language: row.language,
        symbol: row.symbol || undefined,
        chunkType: row.chunk_type || undefined,
        repo: row.repo,
        fileType: '',
        directory: '',
      },
      source,
    };
  }
}
