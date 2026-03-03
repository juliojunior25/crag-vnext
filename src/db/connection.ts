import { Pool } from 'pg';
import { settings } from '../config/settings';

let pool: Pool | null = null;

/**
 * Get or create a singleton Postgres connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: settings.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Set HNSW ef_search for better recall on each new connection
    pool.on('connect', async (client) => {
      try {
        await client.query('SET hnsw.ef_search = 100');
      } catch {
        // Ignore if HNSW extension not yet available
      }
    });
  }
  return pool;
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
