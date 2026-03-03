import type { IEmbeddingProvider } from '../../interfaces/IEmbeddingProvider';
import { settings } from '../../config/settings';

/**
 * Ollama embedding provider
 * Uses Ollama's /api/embed endpoint for batch embedding
 * Default model: qwen3-embedding:0.6b
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
    dimensions?: number;
  } = {}) {
    this.model = config.model || settings.EMBEDDING_MODEL;
    this.baseURL = (config.baseURL || settings.OLLAMA_URL).replace(/\/+$/, '');
    this.timeout = config.timeout || 60000;
    this.maxRetries = config.maxRetries || 3;
    this.dimensions = config.dimensions || this.getModelDimensions(this.model);
    this.maxTokens = this.getModelMaxTokens(this.model);
  }

  async embed(text: string, isQuery?: boolean): Promise<number[]> {
    const results = await this.embedBatch([text], isQuery);
    return results[0];
  }

  async embedBatch(texts: string[], isQuery?: boolean): Promise<number[][]> {
    const formattedTexts = isQuery ? texts.map(t => this.addQueryPrefix(t)) : texts;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await this.fetchBatchEmbeddings(formattedTexts);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw new Error(`Failed to get embeddings after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return false;

      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models || [];
      return models.some(m => m.name.includes(this.model.split(':')[0]));
    } catch {
      return false;
    }
  }

  /**
   * Batch embedding using Ollama /api/embed (native batch support)
   */
  private async fetchBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseURL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { embeddings?: number[][] };

    if (!data.embeddings || !Array.isArray(data.embeddings)) {
      throw new Error('Invalid response from Ollama API: missing embeddings');
    }

    return data.embeddings;
  }

  // Instruction prefixes per model — applied to queries only, not documents
  private static readonly QUERY_PREFIXES: Record<string, string> = {
    'qwen3-embedding': 'Instruct: Given a code search query, retrieve relevant code snippets\nQuery: ',
    'nomic-embed-text': 'search_query: ',
    'nomic-embed-code': 'Represent this query for searching relevant code: ',
    'mxbai-embed-large': 'Represent this sentence for searching relevant passages: ',
    'snowflake-arctic-embed': 'Represent this sentence for searching relevant passages: ',
    'bge-m3': 'Represent this sentence for searching relevant passages: ',
  };

  private addQueryPrefix(text: string): string {
    for (const [modelKey, prefix] of Object.entries(OllamaEmbeddingProvider.QUERY_PREFIXES)) {
      if (this.model.includes(modelKey)) return prefix + text;
    }
    return text;
  }

  private getModelDimensions(model: string): number {
    const modelDimensions: Record<string, number> = {
      'qwen3-embedding': 1024,
      'nomic-embed-text': 768,
      'mxbai-embed-large': 1024,
      'all-minilm': 384,
      'snowflake-arctic-embed': 1024,
      'bge-m3': 1024,
    };

    for (const [key, dims] of Object.entries(modelDimensions)) {
      if (model.includes(key)) return dims;
    }

    return settings.EMBEDDING_DIMENSIONS;
  }

  private getModelMaxTokens(model: string): number {
    const modelMaxTokens: Record<string, number> = {
      'qwen3-embedding': 8192,
      'nomic-embed-text': 8192,
      'mxbai-embed-large': 512,
      'all-minilm': 512,
      'snowflake-arctic-embed': 512,
      'bge-m3': 8192,
    };

    for (const [key, tokens] of Object.entries(modelMaxTokens)) {
      if (model.includes(key)) return tokens;
    }

    return 8192;
  }
}
