/**
 * Metadata about a file in the repository
 */
export interface FileMetadata {
  /** Absolute path to the file */
  filePath: string;

  /** Relative path from project root */
  relativePath: string;

  /** File size in bytes */
  size: number;

  /** Programming language */
  language: string;

  /** Parent directory */
  directory: string;

  /** File extension */
  extension: string;

  /** Files this file imports */
  imports: string[];

  /** Files that import this file */
  importedBy: string[];

  /** Total number of lines */
  lines: number;

  /** Number of chunks created from this file */
  chunks: number;

  /** Core score (0-100, higher = more central to codebase) */
  coreScore?: number;
}

/**
 * Dependency graph for a set of files
 */
export interface DependencyGraph {
  /** Map of file path to metadata */
  files: Map<string, FileMetadata>;

  /** Get files that import a given file */
  getImporters: (filePath: string) => FileMetadata[];

  /** Get files imported by a given file */
  getImports: (filePath: string) => FileMetadata[];

  /** Calculate core score for a file */
  calculateCoreScore: (filePath: string) => number;
}
