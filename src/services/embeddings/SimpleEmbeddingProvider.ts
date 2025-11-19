import type { IEmbeddingProvider } from '../../interfaces/IEmbeddingProvider';

/**
 * Simple embedding provider using TF-IDF-like approach
 * This is a fallback provider that doesn't require external services
 *
 * NOTE: This should only be used for development/testing.
 * For production, use real embeddings (Ollama, OpenAI, etc.)
 */
export class SimpleEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'simple';
  readonly dimensions = 384; // Simulating a common embedding size
  readonly maxTokens = 8192;

  async embed(text: string, isQuery?: boolean): Promise<number[]> {
    return this.createSimpleEmbedding(text);
  }

  async embedBatch(texts: string[], isQuery?: boolean): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text, isQuery)));
  }

  async healthCheck(): Promise<boolean> {
    return true; // Always available
  }

  /**
   * Creates a simple embedding based on code characteristics
   * This is the same approach as the old VectorStore for backward compatibility
   */
  private createSimpleEmbedding(content: string): number[] {
    const lines = content.split('\n').length;
    const words = content.split(/\s+/).length;
    const imports = (content.match(/import\s+/g) || []).length;
    const exports = (content.match(/export\s+/g) || []).length;
    const functions = (content.match(/(function|=>|=>\s*\{)/g) || []).length;
    const classes = (content.match(/class\s+/g) || []).length;
    const types = (content.match(/:\s*\w+/g) || []).length;
    const interfaces = (content.match(/interface\s+/g) || []).length;
    const async = (content.match(/async\s+/g) || []).length;
    const await = (content.match(/await\s+/g) || []).length;
    const const_ = (content.match(/const\s+/g) || []).length;
    const let_ = (content.match(/let\s+/g) || []).length;

    // Create a larger vector with more features (384 dimensions to match common models)
    const features = [
      lines, words, imports, exports, functions, classes, types, interfaces,
      async, await, const_, let_
    ];

    // Pad with zeros to reach 384 dimensions
    const embedding = new Array(this.dimensions).fill(0);

    // Normalize and set the first features
    for (let i = 0; i < features.length; i++) {
      // Simple normalization
      embedding[i] = Math.min(features[i] / 100, 1);
    }

    // Add some derived features for better representation
    embedding[12] = Math.min((imports + exports) / 50, 1); // Import/export ratio
    embedding[13] = Math.min((async + await) / 20, 1); // Async patterns
    embedding[14] = Math.min((const_ + let_) / 100, 1); // Variable declarations
    embedding[15] = Math.min(functions / classes || 0, 1); // Function to class ratio

    return embedding;
  }
}

