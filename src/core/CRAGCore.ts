import type { IEmbeddingProvider } from '../interfaces/IEmbeddingProvider';
import type { IndexedRepository } from '../models/IndexedRepository';
import type { RAGQuery, SemanticSearchResult } from '../models/RAGQuery';
import type { DependencyGraph } from '../models/FileMetadata';
import type { RagConfig, RepoSpec } from '../config/schema';
import { PostgresVectorDatabase } from '../backends/PostgresVectorDatabase';
import { OllamaEmbeddingProvider } from '../services/embeddings/OllamaEmbeddingProvider';
import { TreeSitterChunkingStrategy } from '../services/chunking/TreeSitterChunkingStrategy';
import { OllamaReranker } from '../services/reranking/OllamaReranker';
import type { IReranker } from '../services/reranking/IReranker';
import { RepositoryIndexer } from './RepositoryIndexer';
import { createTreeLogger } from '../utils/logger';
import type { TreeLogger } from '../utils/treeLogger';

/**
 * CRAGCore - Multi-repo, config-driven unified API
 *
 * @example
 * ```typescript
 * const config = loadConfig('config/rag.yaml');
 * const crag = new CRAGCore(config);
 * await crag.indexAll();
 * const results = await crag.query('como funciona autenticacao');
 * ```
 */
export class CRAGCore {
  private log: TreeLogger;
  private config: RagConfig;
  private db: PostgresVectorDatabase;
  private embeddingProvider: IEmbeddingProvider;
  private reranker: IReranker | null = null;
  private indexer: RepositoryIndexer;
  private initialized = false;

  constructor(config: RagConfig) {
    this.log = createTreeLogger({ component: 'CRAGCore' }, { structuredLogger: false });
    this.config = config;

    this.db = new PostgresVectorDatabase({
      embeddingDimensions: config.embeddingDimensions,
      searchEngine: config.search?.engine,
    });

    this.embeddingProvider = new OllamaEmbeddingProvider({
      model: config.embeddingModel,
      dimensions: config.embeddingDimensions,
    });

    // Initialize reranker if enabled
    if (config.reranker?.enabled) {
      this.reranker = new OllamaReranker({
        model: config.reranker.model,
      });
    }

    const chunking = new TreeSitterChunkingStrategy({
      maxChunkSize: config.maxChunkSize,
    });

    this.indexer = new RepositoryIndexer({
      projectPath: config.repos[0]?.path || '.',
      projectId: config.repos[0]?.name || 'default',
      embeddingProvider: this.embeddingProvider,
      vectorDatabase: this.db,
      chunkingStrategy: chunking,
    });
  }

  /**
   * Ensure database is initialized
   */
  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.db.initialize('crag');
      this.initialized = true;
    }
  }

  /**
   * Index all repos from config
   */
  async indexAll(full?: boolean): Promise<void> {
    await this.ensureInit();

    for (const repo of this.config.repos) {
      try {
        await this.indexer.indexRepo(repo, full);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log.error(`Failed to index repo "${repo.name}": ${msg}`);
      }
    }
  }

  /**
   * Index a specific repo by name
   */
  async indexRepo(repoName: string, full?: boolean): Promise<void> {
    await this.ensureInit();

    const repo = this.config.repos.find(r => r.name === repoName);
    if (!repo) {
      throw new Error(`Repo "${repoName}" not found in config`);
    }

    await this.indexer.indexRepo(repo, full);
  }

  /**
   * Hybrid search across repos
   */
  async query(
    text: string,
    options?: {
      repos?: string[];
      lexicalK?: number;
      vectorK?: number;
      finalK?: number;
      maxRepos?: number;
    }
  ): Promise<SemanticSearchResult[]> {
    await this.ensureInit();

    const queryDefaults = this.config.query || {};
    const rerankerConfig = this.config.reranker;
    const finalK = options?.finalK ?? queryDefaults.finalK ?? 10;

    // Select repos
    let repos: string[];
    if (options?.repos && options.repos.length > 0) {
      repos = options.repos;
    } else {
      const maxRepos = options?.maxRepos || queryDefaults.maxRepos || 5;
      repos = this.config.repos.slice(0, maxRepos).map(r => r.name);
    }

    // Generate query embedding
    const queryVector = await this.embeddingProvider.embed(text, true);

    // When reranking, fetch more candidates from hybrid search
    const candidateK = this.reranker
      ? (rerankerConfig?.candidateK ?? 30)
      : finalK;

    // Hybrid search (first stage)
    const candidates = await this.db.hybridSearch(text, queryVector, repos, {
      lexicalK: options?.lexicalK ?? queryDefaults.lexicalK ?? 30,
      vectorK: options?.vectorK ?? queryDefaults.vectorK ?? 30,
      finalK: candidateK,
      lexicalWeight: queryDefaults.lexicalWeight ?? 0.55,
    });

    // Rerank if enabled (second stage)
    if (this.reranker && candidates.length > 0) {
      try {
        const docs = candidates.map(c => c.content);
        const reranked = await this.reranker.rerank(text, docs, finalK);

        return reranked.map(r => ({
          ...candidates[r.index],
          similarity: r.score,
        }));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log.error(`Reranker failed, using first-stage results: ${msg}`);
      }
    }

    return candidates.slice(0, finalK);
  }

  /**
   * Watch for changes and re-index periodically
   */
  async watch(intervalSec?: number): Promise<void> {
    const interval = (intervalSec || this.config.watchInterval || 30) * 1000;
    this.log.info(`Watching for changes every ${interval / 1000}s...`);

    const tick = async () => {
      try {
        await this.indexAll(false);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log.error(`Watch cycle failed: ${msg}`);
      }
    };

    // Initial index
    await tick();

    // Poll
    setInterval(tick, interval);
  }

  /**
   * Get status of all repos
   */
  async getStatus(): Promise<Array<{
    repo: string;
    path: string;
    lastCommit: string | null;
    lastIndexedAt: Date | null;
    chunkCount: number;
  }>> {
    await this.ensureInit();

    const chunkCounts = await this.db.getRepoChunkCounts();
    const countMap = new Map(chunkCounts.map(c => [c.repo, c.count]));

    const statuses = [];
    for (const repo of this.config.repos) {
      const state = await this.db.getRepoState(repo.name);
      statuses.push({
        repo: repo.name,
        path: repo.path,
        lastCommit: state?.lastIndexedCommit || null,
        lastIndexedAt: state?.lastIndexedAt || null,
        chunkCount: countMap.get(repo.name) || 0,
      });
    }

    return statuses;
  }

  /**
   * Health check: DB + Ollama
   */
  async healthCheck(): Promise<{ db: boolean; ollama: boolean }> {
    const [db, ollama] = await Promise.all([
      this.db.healthCheck(),
      this.embeddingProvider.healthCheck(),
    ]);
    return { db, ollama };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.db.close();
  }

  // Legacy compatibility
  getDependencyGraph(): DependencyGraph | null {
    return null;
  }

  getRepository(): IndexedRepository | null {
    return null;
  }
}
