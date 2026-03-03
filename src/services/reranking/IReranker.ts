export interface RerankResult {
  index: number;
  score: number;
}

export interface IReranker {
  rerank(query: string, documents: string[], topK: number): Promise<RerankResult[]>;
  healthCheck(): Promise<boolean>;
}
