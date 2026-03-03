/**
 * Represents a chunk of code extracted from a file
 */
export interface CodeChunk {
  /** Unique identifier for the chunk */
  id: string;

  /** Path to the source file */
  filePath: string;

  /** The actual code content */
  content: string;

  /** Starting line number (1-based) */
  startLine: number;

  /** Ending line number (1-based) */
  endLine: number;

  /** Programming language */
  language: string;

  /** AST node type (function, class, interface, etc.) */
  astNode?: string;

  /** Symbol name (function/class/method name) */
  symbol?: string;

  /** Chunk type classification */
  chunkType?: 'function' | 'class' | 'method' | 'interface' | 'type' | 'module' | 'block';

  /** Repository name */
  repo?: string;

  /** SHA-256 hash of the content */
  contentHash?: string;

  /** Code characteristics extracted from content */
  characteristics?: Record<string, number>;
}

/**
 * Metadata associated with a code vector
 */
export interface CodeVectorMetadata {
  /** Starting line number */
  startLine: number;

  /** Ending line number */
  endLine: number;

  /** AST node type */
  astNode?: string;

  /** Programming language */
  language: string;

  /** Chunk ID reference */
  chunkId?: string;

  /** File extension */
  fileType: string;

  /** Directory containing the file */
  directory: string;

  /** Symbol name */
  symbol?: string;

  /** Chunk type */
  chunkType?: string;

  /** Repository name */
  repo?: string;

  /** Code characteristics */
  characteristics?: Record<string, number>;
}

/**
 * A code chunk with its vector embedding, ready for storage
 */
export interface CodeVector {
  /** Unique identifier */
  id: string;

  /** Path to the source file */
  filePath: string;

  /** The actual code content */
  content: string;

  /** Vector embedding */
  embedding: number[];

  /** Associated metadata */
  metadata: CodeVectorMetadata;

  /** SHA-256 hash of the content */
  contentHash?: string;

  /** Whether this vector is active (not soft-deleted) */
  isActive?: boolean;
}
