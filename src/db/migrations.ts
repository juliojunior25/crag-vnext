import type { Pool } from 'pg';

/**
 * Run database migrations: extensions, tables, triggers, indexes
 */
export async function runMigrations(pool: Pool, embeddingDimensions: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Extensions
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

    // repo_state table
    await client.query(`
      CREATE TABLE IF NOT EXISTS repo_state (
        repo        TEXT PRIMARY KEY,
        path        TEXT NOT NULL,
        last_indexed_commit TEXT,
        last_indexed_at     TIMESTAMPTZ DEFAULT now()
      )
    `);

    // chunks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id           SERIAL PRIMARY KEY,
        repo         TEXT NOT NULL,
        path         TEXT NOT NULL,
        language     TEXT NOT NULL DEFAULT 'unknown',
        symbol       TEXT,
        chunk_type   TEXT,
        start_line   INT NOT NULL DEFAULT 1,
        end_line     INT NOT NULL DEFAULT 1,
        content      TEXT NOT NULL,
        embedding    vector(${embeddingDimensions}),
        content_hash TEXT,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        tsv          tsvector,
        created_at   TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Auto-populate tsvector trigger with camelCase/snake_case splitting.
    // "getUserName" → tokens: get, user, name + getusername
    // "get_user_name" → tokens: get, user, name + get_user_name
    await client.query(`
      CREATE OR REPLACE FUNCTION chunks_tsv_update() RETURNS trigger AS $$
      BEGIN
        NEW.tsv := to_tsvector('simple',
          regexp_replace(
            regexp_replace(NEW.content, '([a-z])([A-Z])', E'\\1 \\2', 'g'),
            '_', ' ', 'g'
          )
        ) || to_tsvector('simple', NEW.content);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chunks_tsv'
        ) THEN
          CREATE TRIGGER trg_chunks_tsv
            BEFORE INSERT OR UPDATE OF content ON chunks
            FOR EACH ROW EXECUTE FUNCTION chunks_tsv_update();
        END IF;
      END $$
    `);

    // Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_tsv
        ON chunks USING GIN (tsv)
    `);

    // Migrate from IVFFlat to HNSW (incremental, no rebuild needed, better recall)
    await client.query(`DROP INDEX IF EXISTS idx_chunks_embedding`);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
        ON chunks USING hnsw (embedding vector_cosine_ops)
        WITH (m = 24, ef_construction = 128)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_repo_path_active
        ON chunks (repo, path, is_active)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_repo_active
        ON chunks (repo, is_active)
    `);

    await client.query('COMMIT');

    // Best-effort: try to enable BM25 extension (pg_textsearch or pg_search)
    // These are optional — if not installed, we fall back to ts_rank_cd
    await tryCreateBM25Index(client);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Attempt to create a BM25 index using pg_textsearch or pg_search.
 * Fails silently if the extension isn't available.
 */
async function tryCreateBM25Index(client: import('pg').PoolClient): Promise<void> {
  const extensions = ['pg_textsearch', 'pg_search'];

  for (const ext of extensions) {
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS ${ext}`);

      if (ext === 'pg_textsearch') {
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_chunks_bm25
            ON chunks USING bm25 (content)
        `);
      } else if (ext === 'pg_search') {
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_chunks_bm25
            ON chunks USING bm25 (id, content)
            WITH (key_field='id')
        `);
      }

      // If we got here, BM25 is available
      return;
    } catch {
      // Extension not available, try next or fall back
    }
  }
}
