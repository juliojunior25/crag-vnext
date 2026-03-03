/**
 * Environment-based settings with sensible defaults
 */
export const settings = {
  /** Postgres connection string */
  get DATABASE_URL(): string {
    return process.env.DATABASE_URL || 'postgresql://crag:crag@localhost:5433/crag';
  },

  /** Ollama base URL */
  get OLLAMA_URL(): string {
    return process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  },

  /** Path to rag config YAML */
  get RAG_CONFIG(): string {
    return process.env.RAG_CONFIG || 'config/rag.yaml';
  },

  /** Embedding model name */
  get EMBEDDING_MODEL(): string {
    return process.env.EMBEDDING_MODEL || 'qwen3-embedding:0.6b';
  },

  /** Embedding dimensions */
  get EMBEDDING_DIMENSIONS(): number {
    return parseInt(process.env.EMBEDDING_DIMENSIONS || '1024', 10);
  },

  /** API server port */
  get API_PORT(): number {
    return parseInt(process.env.API_PORT || '8080', 10);
  },

  /** Log level */
  get LOG_LEVEL(): string {
    return process.env.LOG_LEVEL || 'info';
  },
};
