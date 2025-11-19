import type { IEmbeddingProvider } from '../../interfaces/IEmbeddingProvider';

/**
 * OpenAI embedding provider
 * Uses OpenAI's embedding models (text-embedding-3-small, text-embedding-3-large, etc.)
 */
export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions: number;
  readonly maxTokens: number;

  private apiKey: string;
  private model: string;
  private baseURL: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: {
    apiKey: string;
    model?: string;
    baseURL?: string;
    timeout?: number;
    maxRetries?: number;
  }) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.apiKey = config.apiKey;
    this.model = config.model || 'text-embedding-3-small';
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;

    // Set dimensions based on model
    this.dimensions = this.getModelDimensions(this.model);
    this.maxTokens = 8191; // OpenAI embedding models support up to 8191 tokens
  }

  async embed(text: string, isQuery?: boolean): Promise<number[]> {
    const results = await this.embedBatch([text], isQuery);
    return results[0];
  }

  async embedBatch(texts: string[], isQuery?: boolean): Promise<number[][]> {
    // OpenAI supports batch embedding natively
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const embeddings = await this.fetchEmbeddings(texts);
        return embeddings;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw new Error(`Failed to get embeddings after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private async fetchEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        encoding_format: 'float',
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as any;

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response from OpenAI API: missing data');
    }

    // Sort by index to ensure correct order
    const sortedData = data.data.sort((a: any, b: any) => a.index - b.index);

    return sortedData.map((item: any) => {
      if (!item.embedding || !Array.isArray(item.embedding)) {
        throw new Error('Invalid embedding in response');
      }
      return item.embedding;
    });
  }

  private getModelDimensions(model: string): number {
    const modelDimensions: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
    };

    return modelDimensions[model] || 1536;
  }
}

