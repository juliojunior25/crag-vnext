import type { IEmbeddingProvider } from '../../interfaces/IEmbeddingProvider';

/**
 * Ollama embedding provider
 * Uses Ollama's embedding models (nomic-embed-text, mxbai-embed-large, etc.)
 */
export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'ollama';
  readonly dimensions: number;
  readonly maxTokens: number;

  private baseURL: string;
  private model: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: {
    model?: string;
    baseURL?: string;
    timeout?: number;
    maxRetries?: number;
  } = {}) {
    this.model = config.model || 'nomic-embed-text';
    this.baseURL = config.baseURL || 'http://localhost:11434';
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;

    // Set dimensions based on model
    this.dimensions = this.getModelDimensions(this.model);
    this.maxTokens = this.getModelMaxTokens(this.model);
  }

  async embed(text: string, isQuery?: boolean): Promise<number[]> {
    const results = await this.embedBatch([text], isQuery);
    return results[0];
  }

  async embedBatch(texts: string[], isQuery?: boolean): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          const embedding = await this.fetchEmbedding(text);
          embeddings.push(embedding);
          lastError = null;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Wait before retry (exponential backoff)
          if (attempt < this.maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
        }
      }

      if (lastError) {
        throw new Error(`Failed to get embedding after ${this.maxRetries} attempts: ${lastError.message}`);
      }
    }

    return embeddings;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as any;

      // Check if our model is available
      const models = data.models || [];
      return models.some((m: any) => m.name.includes(this.model));
    } catch {
      return false;
    }
  }

  private async fetchEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseURL}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as any;

    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Invalid response from Ollama API: missing embedding');
    }

    return data.embedding;
  }

  private getModelDimensions(model: string): number {
    // Common Ollama embedding models and their dimensions
    const modelDimensions: Record<string, number> = {
      'nomic-embed-text': 768,
      'mxbai-embed-large': 1024,
      'all-minilm': 384,
      'snowflake-arctic-embed': 1024,
      'embeddinggemma': 768,
    };

    for (const [key, dims] of Object.entries(modelDimensions)) {
      if (model.includes(key)) {
        return dims;
      }
    }

    // Default to 768 if unknown
    return 768;
  }

  private getModelMaxTokens(model: string): number {
    // Most embedding models support 512 or 8192 tokens
    const modelMaxTokens: Record<string, number> = {
      'nomic-embed-text': 8192,
      'mxbai-embed-large': 512,
      'all-minilm': 512,
      'snowflake-arctic-embed': 512,
      'embeddinggemma': 8192,
    };

    for (const [key, tokens] of Object.entries(modelMaxTokens)) {
      if (model.includes(key)) {
        return tokens;
      }
    }

    return 512;
  }
}

