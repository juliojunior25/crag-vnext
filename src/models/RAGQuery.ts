/**
 * Filters for RAG queries
 */
export interface RAGQueryFilters {
  /** Filter by file extensions */
  fileTypes?: string[];

  /** Filter by directories */
  directories?: string[];

  /** Filter by AST node types */
  astNodeTypes?: string[];

  /** Exclude specific paths */
  excludePaths?: string[];

  /** Filter by repository names */
  repos?: string[];

  /** Custom metadata filters */
  metadata?: Record<string, unknown>;
}

/**
 * A RAG query request
 */
export interface RAGQuery {
  /** The search text */
  text: string;

  /** Number of results to return */
  topK?: number;

  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;

  /** Query filters */
  filters?: RAGQueryFilters;

  /** Whether to apply reranking */
  rerank?: boolean;
}

/**
 * Configuration for RAG query execution
 */
export interface RAGQueryConfig {
  /** Enable hybrid search (keyword + vector) */
  hybridSearch?: boolean;

  /** Weight for keyword/lexical search (0-1) */
  keywordWeight?: number;

  /** Number of lexical search results to fetch */
  lexicalK?: number;

  /** Number of vector search results to fetch */
  vectorK?: number;

  /** Final number of merged results */
  finalK?: number;

  /** Maximum number of repos to search */
  maxRepos?: number;
}

/**
 * A single search result from semantic search
 */
export interface SemanticSearchResult {
  /** Path to the source file */
  filePath: string;

  /** The matched code content */
  content: string;

  /** Similarity score (0-1) */
  similarity: number;

  /** Associated metadata */
  metadata: {
    startLine: number;
    endLine: number;
    astNode?: string;
    language: string;
    chunkId?: string;
    fileType: string;
    directory: string;
    symbol?: string;
    chunkType?: string;
    repo?: string;
    characteristics?: Record<string, number>;
  };

  /** Source type (lexical, vector, hybrid) */
  source?: 'lexical' | 'vector' | 'hybrid';
}
