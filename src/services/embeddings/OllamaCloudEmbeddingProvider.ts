import type { IEmbeddingProvider } from '../../interfaces/IEmbeddingProvider';

/**
 * Ollama Cloud embedding provider
 * Uses Ollama's cloud API (https://ollama.com) for embeddings
 * Requires OLLAMA_API_KEY environment variable or apiKey in config
 * 
 * ⚠️ LIMITAÇÃO: O Ollama Cloud NÃO suporta o endpoint /api/embeddings.
 * Este provider está implementado mas não funcionará até que o Ollama Cloud
 * adicione suporte para embeddings.
 * 
 * SOLUÇÕES ALTERNATIVAS:
 * 1. Use Ollama local: type: 'ollama' com baseURL: 'http://localhost:11434'
 * 2. Use OpenAI: type: 'openai' com sua API key
 * 3. Use OpenRouter: type: 'openrouter' com sua API key
 * 
 * @see https://docs.ollama.com/cloud
 */
export class OllamaCloudEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'ollama-cloud';
  readonly dimensions: number;
  readonly maxTokens: number;

  private baseURL: string;
  private model: string;
  private apiKey: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: {
    model?: string;
    apiKey?: string;
    baseURL?: string;
    timeout?: number;
    maxRetries?: number;
  } = {}) {
    this.model = config.model || 'nomic-embed-text';
    this.baseURL = config.baseURL || 'https://ollama.com';
    this.timeout = config.timeout || 60000; // Cloud may be slower
    this.maxRetries = config.maxRetries || 3;

    // Get API key from config or environment variable
    this.apiKey = config.apiKey || process.env.OLLAMA_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error(
        'Ollama Cloud API key is required. ' +
        'Set OLLAMA_API_KEY environment variable or provide apiKey in config. ' +
        'Get your API key at https://ollama.com/settings/keys'
      );
    }

    // Set dimensions based on model
    this.dimensions = this.getModelDimensions(this.model);
    this.maxTokens = this.getModelMaxTokens(this.model);

    // Aviso sobre limitação conhecida
    console.warn(
      '⚠️  AVISO: Ollama Cloud não suporta embeddings via API.\n' +
      '   O endpoint /api/embeddings não está disponível.\n' +
      '   Use Ollama local (type: "ollama") ou outro provider (OpenAI/OpenRouter).'
    );
  }

  async embed(text: string, isQuery?: boolean): Promise<number[]> {
    const results = await this.embedBatch([text], isQuery);
    return results[0];
  }

  async embedBatch(texts: string[], isQuery?: boolean): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          const embedding = await this.fetchEmbedding(text);
          embeddings.push(embedding);
          lastError = null;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // Log do erro para debug
          if (attempt === 0) {
            console.error(`[OllamaCloud] Erro ao processar texto ${i + 1}/${texts.length}:`, {
              error: lastError.message,
              textPreview: text.substring(0, 100),
              attempt: attempt + 1,
              maxRetries: this.maxRetries,
            });
          }

          // Wait before retry (exponential backoff)
          if (attempt < this.maxRetries - 1) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (lastError) {
        throw new Error(
          `Failed to get embedding for text ${i + 1}/${texts.length} after ${this.maxRetries} attempts: ${lastError.message}`
        );
      }
    }

    return embeddings;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private async fetchEmbedding(text: string): Promise<number[]> {
    const url = `${this.baseURL}/api/embeddings`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch {
          errorText = `HTTP ${response.status} ${response.statusText}`;
        }
        
        // Log detalhado do erro
        console.error(`[OllamaCloud] Erro na requisição:`, {
          url,
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          model: this.model,
          textLength: text.length,
        });
        
        if (response.status === 401) {
          throw new Error(
            'Ollama Cloud authentication failed. ' +
            'Please check your OLLAMA_API_KEY. ' +
            'Get your API key at https://ollama.com/settings/keys'
          );
        }
        
        if (response.status === 404) {
          throw new Error(
            `❌ Ollama Cloud NÃO suporta embeddings via API. ` +
            `O endpoint /api/embeddings não está disponível no Ollama Cloud. ` +
            `\n\n💡 SOLUÇÕES:\n` +
            `1. Use Ollama local: { type: 'ollama', baseURL: 'http://localhost:11434' }\n` +
            `2. Use OpenAI: { type: 'openai', apiKey: '...' }\n` +
            `3. Use OpenRouter: { type: 'openrouter', apiKey: '...' }\n\n` +
            `O Ollama Cloud atualmente só suporta chat, não embeddings.`
          );
        }
        
        throw new Error(`Ollama Cloud API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as any;

      if (!data.embedding || !Array.isArray(data.embedding)) {
        console.error(`[OllamaCloud] Resposta inválida:`, {
          hasEmbedding: !!data.embedding,
          embeddingType: typeof data.embedding,
          dataKeys: Object.keys(data),
          data: JSON.stringify(data).substring(0, 200),
        });
        throw new Error('Invalid response from Ollama Cloud API: missing embedding');
      }

      return data.embedding;
    } catch (error) {
      // Se for um erro de timeout ou rede, fornecer mais contexto
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          throw new Error(
            `Ollama Cloud request timeout after ${this.timeout}ms. ` +
            `The service may be slow or unavailable. ` +
            `Original error: ${error.message}`
          );
        }
        if (error.message.includes('fetch')) {
          throw new Error(
            `Failed to connect to Ollama Cloud at ${this.baseURL}. ` +
            `Check your internet connection and API endpoint. ` +
            `Original error: ${error.message}`
          );
        }
      }
      throw error;
    }
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

