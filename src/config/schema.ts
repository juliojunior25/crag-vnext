/**
 * Specification for a single repository to index
 */
export interface RepoSpec {
  /** Unique name for this repo */
  name: string;

  /** Absolute path to the repository root */
  path: string;

  /** File extensions to include (e.g., ['.ts', '.py']) */
  extensions?: string[];

  /** Directories to exclude */
  excludeDirs?: string[];

  /** Glob patterns to exclude */
  excludePatterns?: string[];

  /** Whether to build the dependency graph */
  buildDependencyGraph?: boolean;
}

/**
 * Ignore/include specification for file collection
 */
export interface IgnoreSpec {
  /** Directories to always exclude */
  dirs?: string[];

  /** File patterns to exclude */
  patterns?: string[];

  /** File extensions to exclude */
  extensions?: string[];
}

/**
 * Query configuration defaults
 */
export interface QuerySpec {
  /** Number of lexical search results */
  lexicalK?: number;

  /** Number of vector search results */
  vectorK?: number;

  /** Final merged result count */
  finalK?: number;

  /** Lexical weight (0-1), vector weight = 1 - lexicalWeight */
  lexicalWeight?: number;

  /** Maximum repos to search at once */
  maxRepos?: number;
}

/**
 * Reranker configuration
 */
export interface RerankerSpec {
  /** Whether reranking is enabled */
  enabled?: boolean;

  /** Ollama model for reranking (e.g., "qwen3-reranker:0.6b") */
  model?: string;

  /** Number of candidates to send to the reranker */
  candidateK?: number;
}

/**
 * BM25 tuning parameters
 */
export interface BM25Spec {
  /** Term frequency saturation (default: 1.2) */
  k1?: number;

  /** Length normalization (default: 0.75) */
  b?: number;
}

/**
 * Search engine configuration
 */
export interface SearchSpec {
  /** Search engine: "bm25" (requires pg_textsearch) or "fts" (ts_rank_cd fallback) */
  engine?: 'bm25' | 'fts';

  /** BM25 tuning parameters */
  bm25?: BM25Spec;
}

/**
 * Top-level RAG configuration (loaded from YAML)
 */
export interface RagConfig {
  /** Repositories to index */
  repos: RepoSpec[];

  /** Global ignore rules */
  ignore?: IgnoreSpec;

  /** Default query parameters */
  query?: QuerySpec;

  /** Embedding model name */
  embeddingModel?: string;

  /** Embedding dimensions */
  embeddingDimensions?: number;

  /** Maximum chunk size in characters */
  maxChunkSize?: number;

  /** Indexing interval in seconds (for watch mode) */
  watchInterval?: number;

  /** Reranker configuration */
  reranker?: RerankerSpec;

  /** Search engine configuration */
  search?: SearchSpec;
}
