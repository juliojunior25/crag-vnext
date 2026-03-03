import type { IReranker, RerankResult } from './IReranker';
import { settings } from '../../config/settings';

/**
 * Reranker using Ollama's /api/generate endpoint with a scoring prompt.
 * Uses a lightweight model (e.g., qwen3-reranker:0.6b) to score
 * query-document relevance as a cross-encoder.
 */
export class OllamaReranker implements IReranker {
  private baseURL: string;
  private model: string;
  private timeout: number;
  private concurrency: number;

  constructor(config: {
    model?: string;
    baseURL?: string;
    timeout?: number;
    concurrency?: number;
  } = {}) {
    this.model = config.model || 'qwen3-reranker:0.6b';
    this.baseURL = (config.baseURL || settings.OLLAMA_URL).replace(/\/+$/, '');
    this.timeout = config.timeout || 30000;
    this.concurrency = config.concurrency || 5;
  }

  async rerank(query: string, documents: string[], topK: number): Promise<RerankResult[]> {
    if (documents.length === 0) return [];

    // Score all documents in parallel batches
    const scores = await this.scoreBatch(query, documents);

    // Sort by score descending, return top K
    const indexed = scores.map((score, index) => ({ index, score }));
    indexed.sort((a, b) => b.score - a.score);
    return indexed.slice(0, topK);
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

  private async scoreBatch(query: string, documents: string[]): Promise<number[]> {
    const scores = new Array<number>(documents.length).fill(0);

    // Process in batches to control concurrency
    for (let i = 0; i < documents.length; i += this.concurrency) {
      const batch = documents.slice(i, i + this.concurrency);
      const batchScores = await Promise.all(
        batch.map(doc => this.scoreOne(query, doc))
      );
      for (let j = 0; j < batchScores.length; j++) {
        scores[i + j] = batchScores[j];
      }
    }

    return scores;
  }

  private async scoreOne(query: string, document: string): Promise<number> {
    // Truncate document to avoid exceeding context window
    const maxDocLen = 2000;
    const truncatedDoc = document.length > maxDocLen
      ? document.slice(0, maxDocLen) + '...'
      : document;

    const prompt = `<|query|>${query}<|doc|>${truncatedDoc}`;

    try {
      const response = await fetch(`${this.baseURL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            num_predict: 1,
            temperature: 0,
          },
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) return 0;

      const data = await response.json() as { response?: string };
      const text = (data.response || '').trim().toLowerCase();

      // Qwen3-Reranker outputs "yes"/"no" or a float score
      if (text === 'yes' || text === 'true') return 1;
      if (text === 'no' || text === 'false') return 0;

      const parsed = parseFloat(text);
      return isNaN(parsed) ? 0 : Math.max(0, Math.min(1, parsed));
    } catch {
      return 0;
    }
  }
}
