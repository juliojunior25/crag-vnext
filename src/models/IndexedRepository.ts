import type { FileMetadata, DependencyGraph } from './FileMetadata';

/**
 * Configuration for indexing a repository
 */
export interface IndexingConfig {
  /** Glob patterns to include */
  includePatterns?: string[];

  /** Directories to exclude */
  excludeDirectories?: string[];

  /** Auto-detect business rules path */
  detectBusinessRulesPath?: boolean;

  /** Build dependency graph */
  buildDependencyGraph?: boolean;

  /** Chunking strategy to use */
  chunkingStrategy?: string;

  /** Maximum chunk size in lines */
  maxChunkSize?: number;

  /** Overlap between chunks */
  chunkOverlap?: number;

  /** Whether to persist index to disk */
  persist?: boolean;

  /** Storage path for cache */
  storagePath?: string;

  /** Delay between embedding calls (ms) */
  embeddingDelay?: number;

  /** Force full reindex (ignore incremental) */
  full?: boolean;
}

/**
 * Statistics from an indexing run
 */
export interface IndexingStats {
  /** Duration in milliseconds */
  duration: number;

  /** Number of files successfully processed */
  successCount: number;

  /** Number of files that failed */
  errorCount: number;

  /** Total lines of code indexed */
  totalLines: number;

  /** Embedding provider used */
  embeddingProvider: string;

  /** Vector database backend used */
  vectorBackend: string;

  /** Chunking strategy used */
  chunkingStrategy: string;
}

/**
 * Represents a fully indexed repository
 */
export interface IndexedRepository {
  /** Unique project identifier */
  projectId: string;

  /** Path to the project root */
  projectPath: string;

  /** When the repository was last indexed */
  indexedAt: Date;

  /** Total number of files indexed */
  totalFiles: number;

  /** Total number of chunks created */
  totalChunks: number;

  /** Total number of vectors stored */
  totalVectors: number;

  /** File metadata entries */
  files: FileMetadata[];

  /** Dependency graph (if built) */
  dependencyGraph?: DependencyGraph;

  /** Indexing statistics */
  stats: IndexingStats;

  /** Last git commit hash that was indexed */
  lastIndexedCommit?: string;
}
