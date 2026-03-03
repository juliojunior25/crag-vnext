import type { IEmbeddingProvider } from '../interfaces/IEmbeddingProvider';
import type { RAGQuery, SemanticSearchResult, RAGQueryConfig } from '../models/RAGQuery';
import type { PostgresVectorDatabase } from '../backends/PostgresVectorDatabase';
import { createTreeLogger } from '../utils/logger';
import type { TreeLogger } from '../utils/treeLogger';

/**
 * RAGQueryEngine
 * Delegates hybrid search to PostgresVectorDatabase
 */
export class RAGQueryEngine {
  private log: TreeLogger;
  private vectorDatabase: PostgresVectorDatabase;
  private embeddingProvider: IEmbeddingProvider;

  constructor(config: {
    vectorDatabase: PostgresVectorDatabase;
    embeddingProvider: IEmbeddingProvider;
  }) {
    this.log = createTreeLogger({ component: 'RAGQueryEngine' }, { structuredLogger: false });
    this.vectorDatabase = config.vectorDatabase;
    this.embeddingProvider = config.embeddingProvider;
  }

  /**
   * Execute a hybrid RAG query
   */
  async query(
    query: RAGQuery,
    config?: RAGQueryConfig
  ): Promise<SemanticSearchResult[]> {
    const startTime = Date.now();

    // Generate query embedding
    const queryVector = await this.embeddingProvider.embed(query.text, true);

    // Determine repos to search
    const repos = query.filters?.repos || ['default'];
    const maxRepos = config?.maxRepos;
    const selectedRepos = maxRepos ? repos.slice(0, maxRepos) : repos;

    // Execute hybrid search
    const results = await this.vectorDatabase.hybridSearch(
      query.text,
      queryVector,
      selectedRepos,
      {
        lexicalK: config?.lexicalK ?? 30,
        vectorK: config?.vectorK ?? 30,
        finalK: config?.finalK ?? query.topK ?? 10,
        lexicalWeight: config?.keywordWeight ?? 0.55,
      }
    );

    // Apply minimum similarity filter
    let filteredResults = results;
    if (query.minSimilarity !== undefined) {
      filteredResults = results.filter(r => r.similarity >= query.minSimilarity!);
    }

    const duration = Date.now() - startTime;
    this.log.info(
      `Query completed in ${duration}ms, found ${filteredResults.length} results`
    );

    return filteredResults;
  }
}
