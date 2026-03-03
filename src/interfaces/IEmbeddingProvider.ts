/**
 * Interface for embedding providers
 * Converts text into vector embeddings
 */
export interface IEmbeddingProvider {
  /**
   * Name of the embedding provider
   */
  readonly name: string;

  /**
   * Dimensionality of the embeddings produced
   */
  readonly dimensions: number;

  /**
   * Maximum tokens per embedding request
   */
  readonly maxTokens: number;

  /**
   * Generate embedding for a single text
   * @param text - Text to embed
   * @param isQuery - Whether this is a query (vs document). Some models like nomic-embed-code require special prefixes for queries.
   */
  embed(text: string, isQuery?: boolean): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts (batch)
   * More efficient than calling embed() multiple times
   * @param texts - Texts to embed
   * @param isQuery - Whether these are queries (vs documents). Some models like nomic-embed-code require special prefixes for queries.
   */
  embedBatch(texts: string[], isQuery?: boolean): Promise<number[][]>;

  /**
   * Check if the provider is available/healthy
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Configuration for embedding providers
 */
export interface EmbeddingProviderConfig {
  /** Provider type */
  type: 'ollama' | 'simple';

  /** Model name to use (for API-based providers) */
  model?: string;

  /** Model path (for llama-cpp, path to GGUF file) */
  modelPath?: string;

  /** API key (if required) */
  apiKey?: string;

  /** Base URL for API (if custom) */
  baseURL?: string;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Maximum retries on failure */
  maxRetries?: number;

  /** Embedding dimensions (for llama-cpp, will be auto-detected if not provided) */
  dimensions?: number;

  /** Maximum tokens (for llama-cpp) */
  maxTokens?: number;
}

/**
 * Factory for creating embedding providers
 */
export interface IEmbeddingProviderFactory {
  /**
   * Create an embedding provider based on configuration
   */
  create(config: EmbeddingProviderConfig): Promise<IEmbeddingProvider>;
}

