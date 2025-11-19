import type { IEmbeddingProvider, IEmbeddingProviderFactory, EmbeddingProviderConfig } from '../../interfaces/IEmbeddingProvider';
import { SimpleEmbeddingProvider } from './SimpleEmbeddingProvider';
import { OllamaEmbeddingProvider } from './OllamaEmbeddingProvider';
import { OllamaCloudEmbeddingProvider } from './OllamaCloudEmbeddingProvider';
import { LlamaCppEmbeddingProvider } from './LlamaCppEmbeddingProvider';
import { OpenAIEmbeddingProvider } from './OpenAIEmbeddingProvider';

/**
 * Factory for creating embedding providers
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
        });

      case 'ollama-cloud':
        return new OllamaCloudEmbeddingProvider({
          model: config.model,
          apiKey: config.apiKey,
          baseURL: config.baseURL,
          timeout: config.timeout,
          maxRetries: config.maxRetries,
        });

      case 'llama-cpp':
        if (!config.modelPath) {
          throw new Error('modelPath is required for llama-cpp provider');
        }
        return new LlamaCppEmbeddingProvider({
          modelPath: config.modelPath,
          dimensions: config.dimensions,
          maxTokens: config.maxTokens,
        });

      case 'openai':
        if (!config.apiKey) {
          throw new Error('OpenAI API key is required');
        }
        return new OpenAIEmbeddingProvider({
          apiKey: config.apiKey,
          model: config.model,
          baseURL: config.baseURL,
          timeout: config.timeout,
          maxRetries: config.maxRetries,
        });

      case 'openrouter':
        // OpenRouter uses OpenAI-compatible API
        if (!config.apiKey) {
          throw new Error('OpenRouter API key is required');
        }
        return new OpenAIEmbeddingProvider({
          apiKey: config.apiKey,
          model: config.model || 'text-embedding-3-small',
          baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
          timeout: config.timeout,
          maxRetries: config.maxRetries,
        });

      default:
        throw new Error(`Unknown embedding provider type: ${config.type}`);
    }
  }

  /**
   * Create a default embedding provider
   * Tries to use Ollama if available, falls back to Simple
   */
  async createDefault(): Promise<IEmbeddingProvider> {
    // Try Ollama first
    try {
      const ollama = new OllamaEmbeddingProvider();
      const isHealthy = await ollama.healthCheck();
      if (isHealthy) {
        return ollama;
      }
    } catch {
      // Ollama not available
    }

    // Fall back to simple provider
    return new SimpleEmbeddingProvider();
  }
}

