import type { IEmbeddingProvider, IEmbeddingProviderFactory, EmbeddingProviderConfig } from '../../interfaces/IEmbeddingProvider';
import { SimpleEmbeddingProvider } from './SimpleEmbeddingProvider';
import { OllamaEmbeddingProvider } from './OllamaEmbeddingProvider';

/**
 * Factory for creating embedding providers
 * Supports: ollama (default), simple (testing)
 */
export class EmbeddingProviderFactory implements IEmbeddingProviderFactory {
  async create(config: EmbeddingProviderConfig): Promise<IEmbeddingProvider> {
    switch (config.type) {
      case 'simple':
        return new SimpleEmbeddingProvider();

      case 'ollama':
        return new OllamaEmbeddingProvider({
          model: config.model,
          baseURL: config.baseURL,
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          dimensions: config.dimensions,
        });

      default:
        throw new Error(`Unknown embedding provider type: ${config.type}. Supported: ollama, simple`);
    }
  }

  /**
   * Create a default embedding provider
   * Tries Ollama first, falls back to Simple
   */
  async createDefault(): Promise<IEmbeddingProvider> {
    try {
      const ollama = new OllamaEmbeddingProvider();
      const isHealthy = await ollama.healthCheck();
      if (isHealthy) return ollama;
    } catch {
      // Ollama not available
    }

    return new SimpleEmbeddingProvider();
  }
}
