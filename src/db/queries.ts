import type { Pool } from 'pg';
import pgvector from 'pgvector';

/** Row shape from the chunks table */
export interface ChunkRow {
  id: number;
  repo: string;
  path: string;
  language: string;
  symbol: string | null;
  chunk_type: string | null;
  start_line: number;
  end_line: number;
  content: string;
  content_hash: string | null;
  score: number;
}

/**
 * Full-text (lexical) search using tsvector with tiered strategy:
 * 1. First tries AND (websearch_to_tsquery) for precise results
 * 2. Falls back to OR if AND returns < 3 results
 *
 * Uses ts_rank_cd (cover density) with flags:
 *   1  = divides rank by 1 + log(document length) — penalizes long docs
 *   32 = divides rank by itself + 1 — normalizes to comparable range
 */
export async function lexicalSearch(
  pool: Pool,
  queryText: string,
  repos: string[],
  limit: number
): Promise<ChunkRow[]> {
  if (!queryText.trim()) return [];

  // Tier 1: AND search via websearch_to_tsquery (implicit AND between terms)
  const andRows = await lexicalSearchWithQuery(
    pool, queryText, repos, limit, 'websearch'
  );

  if (andRows.length >= 3) return andRows;

  // Tier 2: OR fallback — split into individual terms joined with |
  const orQuery = queryText
    .split(/\s+/)
    .filter(w => w.length > 1)
    .map(w => w.replace(/[^a-zA-Z0-9_]/g, ''))
    .filter(Boolean)
    .join(' | ');

  if (!orQuery) return andRows;

  const orRows = await lexicalSearchWithQuery(
    pool, orQuery, repos, limit, 'raw'
  );

  // Merge: keep AND results first (they're more precise), fill with OR
  const seen = new Set(andRows.map(r => r.id));
  const merged = [...andRows];
  for (const row of orRows) {
    if (!seen.has(row.id)) {
      merged.push(row);
      seen.add(row.id);
    }
    if (merged.length >= limit) break;
  }

  return merged.slice(0, limit);
}

async function lexicalSearchWithQuery(
  pool: Pool,
  queryText: string,
  repos: string[],
  limit: number,
  mode: 'websearch' | 'raw'
): Promise<ChunkRow[]> {
  const tsQueryExpr = mode === 'websearch'
    ? `websearch_to_tsquery('simple', $1)`
    : `to_tsquery('simple', $1)`;

  const { rows } = await pool.query<ChunkRow>(
    `SELECT id, repo, path, language, symbol, chunk_type,
            start_line, end_line, content, content_hash,
            ts_rank_cd(tsv, ${tsQueryExpr}, 33) AS score
       FROM chunks
      WHERE is_active = true
        AND repo = ANY($2)
        AND tsv @@ ${tsQueryExpr}
      ORDER BY score DESC
      LIMIT $3`,
    [queryText, repos, limit]
  );
  return rows;
}

/**
 * Vector similarity search using pgvector cosine distance
 */
export async function vectorSearch(
  pool: Pool,
  queryVector: number[],
  repos: string[],
  limit: number
): Promise<ChunkRow[]> {
  const vecStr = pgvector.toSql(queryVector);

  const { rows } = await pool.query<ChunkRow>(
    `SELECT id, repo, path, language, symbol, chunk_type,
            start_line, end_line, content, content_hash,
            1 - (embedding <=> $1::vector) AS score
       FROM chunks
      WHERE is_active = true
        AND repo = ANY($2)
      ORDER BY embedding <=> $1::vector
      LIMIT $3`,
    [vecStr, repos, limit]
  );
  return rows;
}

/**
 * BM25 search using pg_textsearch or pg_search extension.
 * Returns empty array if BM25 index is not available (fallback to lexicalSearch).
 */
export async function bm25Search(
  pool: Pool,
  queryText: string,
  repos: string[],
  limit: number
): Promise<ChunkRow[]> {
  if (!queryText.trim()) return [];

  try {
    // pg_textsearch uses the <@> operator for BM25 similarity
    const { rows } = await pool.query<ChunkRow>(
      `SELECT id, repo, path, language, symbol, chunk_type,
              start_line, end_line, content, content_hash,
              1.0 / (1.0 + (content <@> $1)) AS score
         FROM chunks
        WHERE content <@> $1 < 10
          AND is_active = true
          AND repo = ANY($2)
        ORDER BY content <@> $1
        LIMIT $3`,
      [queryText, repos, limit]
    );
    return rows;
  } catch {
    // BM25 extension not available, return empty to trigger fallback
    return [];
  }
}

/**
 * Check if BM25 index is available
 */
export async function isBM25Available(pool: Pool): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'idx_chunks_bm25' LIMIT 1`
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Upsert a batch of chunks
 */
export async function upsertChunks(
  pool: Pool,
  chunks: Array<{
    repo: string;
    path: string;
    language: string;
    symbol?: string;
    chunkType?: string;
    startLine: number;
    endLine: number;
    content: string;
    embedding: number[];
    contentHash: string;
  }>
): Promise<void> {
  if (chunks.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const chunk of chunks) {
      const vecStr = pgvector.toSql(chunk.embedding);
      await client.query(
        `INSERT INTO chunks (repo, path, language, symbol, chunk_type,
                             start_line, end_line, content, embedding, content_hash, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10, true)`,
        [
          chunk.repo,
          chunk.path,
          chunk.language,
          chunk.symbol || null,
          chunk.chunkType || null,
          chunk.startLine,
          chunk.endLine,
          chunk.content,
          vecStr,
          chunk.contentHash,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Soft-delete chunks by repo and relative path
 */
export async function deactivateByRepoAndPath(
  pool: Pool,
  repo: string,
  relPath: string
): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE chunks SET is_active = false
      WHERE repo = $1 AND path = $2 AND is_active = true`,
    [repo, relPath]
  );
  return rowCount ?? 0;
}

/**
 * Upsert repo state (last indexed commit)
 */
export async function upsertRepoState(
  pool: Pool,
  repo: string,
  repoPath: string,
  commit: string
): Promise<void> {
  await pool.query(
    `INSERT INTO repo_state (repo, path, last_indexed_commit, last_indexed_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (repo) DO UPDATE
       SET path = EXCLUDED.path,
           last_indexed_commit = EXCLUDED.last_indexed_commit,
           last_indexed_at = now()`,
    [repo, repoPath, commit]
  );
}

/**
 * Get repo state
 */
export async function getRepoState(
  pool: Pool,
  repo: string
): Promise<{ repo: string; path: string; lastIndexedCommit: string | null; lastIndexedAt: Date } | null> {
  const { rows } = await pool.query(
    `SELECT repo, path, last_indexed_commit, last_indexed_at
       FROM repo_state WHERE repo = $1`,
    [repo]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    repo: row.repo,
    path: row.path,
    lastIndexedCommit: row.last_indexed_commit,
    lastIndexedAt: row.last_indexed_at,
  };
}

/**
 * Get chunk counts per repo
 */
export async function getRepoChunkCounts(
  pool: Pool
): Promise<Array<{ repo: string; count: number }>> {
  const { rows } = await pool.query(
    `SELECT repo, COUNT(*) as count FROM chunks WHERE is_active = true GROUP BY repo`
  );
  return rows.map(r => ({ repo: r.repo, count: parseInt(r.count, 10) }));
}

/**
 * Count all active chunks
 */
export async function countActiveChunks(pool: Pool): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM chunks WHERE is_active = true`
  );
  return parseInt(rows[0].count, 10);
}

/**
 * Clear all chunks for a repo
 */
export async function clearRepo(pool: Pool, repo: string): Promise<void> {
  await pool.query(`DELETE FROM chunks WHERE repo = $1`, [repo]);
  await pool.query(`DELETE FROM repo_state WHERE repo = $1`, [repo]);
}

/**
 * Clear all data
 */
export async function clearAll(pool: Pool): Promise<void> {
  await pool.query(`DELETE FROM chunks`);
  await pool.query(`DELETE FROM repo_state`);
}
