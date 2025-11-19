import type { IEmbeddingProvider } from '../interfaces/IEmbeddingProvider';
import type { IVectorDatabase } from '../interfaces/IVectorDatabase';
import type { EmbeddingProviderConfig } from '../interfaces/IEmbeddingProvider';
import type { VectorDatabaseConfig } from '../interfaces/IVectorDatabase';
import type { IndexedRepository, IndexingConfig } from '../models/IndexedRepository';
import type { RAGQuery, SemanticSearchResult } from '../models/RAGQuery';
import type { DependencyGraph } from '../models/FileMetadata';
import { RepositoryIndexer } from './RepositoryIndexer';
import { EmbeddingProviderFactory } from '../services/embeddings/EmbeddingProviderFactory';
import { VectorDatabaseFactory } from '../backends/VectorDatabaseFactory';
import { createTreeLogger } from '../utils/logger';
import type { TreeLogger } from '../utils/treeLogger';

/**
 * Configuração unificada para CodeRAG
 * Todas as configurações necessárias em um único objeto
 */
export interface CodeRAGConfig {
  /** Caminho do projeto a ser indexado */
  projectPath: string;

  /** ID único do projeto */
  projectId: string;

  /** Configuração do provider de embeddings */
  embedding: EmbeddingProviderConfig;

  /** Configuração do banco vetorial */
  vectorDatabase: VectorDatabaseConfig;

  /** Configurações de indexação (opcional) */
  indexing?: {
    /** Padrões de arquivos para incluir (glob patterns) */
    includePatterns?: string[];
    /** Diretórios para excluir */
    excludeDirectories?: string[];
    /** Detectar automaticamente o caminho de regras de negócio */
    detectBusinessRulesPath?: boolean;
    /** Construir grafo de dependências */
    buildDependencyGraph?: boolean;
    /** Estratégia de chunking: 'ast', 'sliding-window', ou 'semantic' */
    chunkingStrategy?: 'ast' | 'sliding-window' | 'semantic';
    /** Tamanho máximo do chunk em tokens */
    maxChunkSize?: number;
    /** Sobreposição entre chunks (para sliding-window) */
    chunkOverlap?: number;
    /** Delay em milissegundos entre processamento de arquivos */
    embeddingDelay?: number;
  };

  /** Configurações de armazenamento */
  storage?: {
    /** Caminho para salvar cache e índices */
    path?: string;
    /** Salvar índice em disco */
    persist?: boolean;
  };
}

/**
 * CodeRAG - API Simplificada
 * 
 * Classe principal que unifica todas as funcionalidades de indexação e busca
 * em uma interface simples com um único objeto de configuração.
 * 
 * @example
 * ```typescript
 * const rag = new CodeRAG({
 *   projectPath: '/path/to/project',
 *   projectId: 'my-project',
 *   embedding: {
 *     type: 'ollama',
 *     model: 'embeddinggemma',
 *     baseURL: 'http://localhost:11434'
 *   },
 *   vectorDatabase: {
 *     type: 'json',
 *     storagePath: '.crag_cache'
 *   }
 * });
 * 
 * await rag.index();
 * const results = await rag.query({ text: 'como fazer autenticação?' });
 * ```
 */
export class CRAGCore {
  private log: TreeLogger;
  private config: CodeRAGConfig;
  private indexer: RepositoryIndexer | null = null;
  private embeddingProvider: IEmbeddingProvider | null = null;
  private vectorDatabase: IVectorDatabase | null = null;

  constructor(config: CodeRAGConfig) {
    this.log = createTreeLogger({ component: 'CodeRAG' }, { structuredLogger: false });
    this.config = config;
  }

  /**
   * Indexa o repositório
   * Cria embeddings e armazena no banco vetorial
   */
  async index(): Promise<IndexedRepository> {
    // Inicializar providers se ainda não foram inicializados
    await this.initializeProviders();

    // Criar indexador se ainda não foi criado
    if (!this.indexer) {
      this.indexer = new RepositoryIndexer({
        projectPath: this.config.projectPath,
        projectId: this.config.projectId,
        embeddingProvider: this.embeddingProvider!,
        vectorDatabase: this.vectorDatabase!,
        storagePath: this.config.storage?.path || '.crag_cache',
      });
    }

    // Preparar configuração de indexação
    const indexingConfig: IndexingConfig = {
      includePatterns: this.config.indexing?.includePatterns,
      excludeDirectories: this.config.indexing?.excludeDirectories,
      detectBusinessRulesPath: this.config.indexing?.detectBusinessRulesPath,
      buildDependencyGraph: this.config.indexing?.buildDependencyGraph,
      chunkingStrategy: this.config.indexing?.chunkingStrategy,
      maxChunkSize: this.config.indexing?.maxChunkSize,
      chunkOverlap: this.config.indexing?.chunkOverlap,
      embeddingDelay: this.config.indexing?.embeddingDelay,
      persist: this.config.storage?.persist,
      storagePath: this.config.storage?.path,
    };

    return await this.indexer.index(indexingConfig);
  }

  /**
   * Busca semântica no código indexado
   */
  async query(query: RAGQuery): Promise<SemanticSearchResult[]> {
    // Inicializar providers se necessário
    await this.initializeProviders();

    // Criar indexador se ainda não foi criado (pode ter sido carregado)
    if (!this.indexer) {
      // Tentar carregar repositório existente
      const repository = await this.load();
      if (!repository) {
        throw new Error('Repositório não indexado. Chame index() primeiro.');
      }
    }

    return await this.indexer!.query(query);
  }

  /**
   * Carrega um repositório previamente indexado
   */
  async load(): Promise<IndexedRepository | null> {
    await this.initializeProviders();

    if (!this.indexer) {
      this.indexer = new RepositoryIndexer({
        projectPath: this.config.projectPath,
        projectId: this.config.projectId,
        embeddingProvider: this.embeddingProvider!,
        vectorDatabase: this.vectorDatabase!,
        storagePath: this.config.storage?.path || '.crag_cache',
      });
    }

    return await this.indexer.load();
  }

  /**
   * Obtém o grafo de dependências
   */
  getDependencyGraph(): DependencyGraph | null {
    if (!this.indexer) {
      return null;
    }
    return this.indexer.getDependencyGraph();
  }

  /**
   * Obtém o repositório indexado atual
   */
  getRepository(): IndexedRepository | null {
    if (!this.indexer) {
      return null;
    }
    return this.indexer.getRepository();
  }

  /**
   * Limpa todos os dados indexados
   */
  async clear(): Promise<void> {
    if (this.indexer) {
      await this.indexer.clear();
    }
  }

  /**
   * Fecha conexões e libera recursos
   */
  async close(): Promise<void> {
    if (this.vectorDatabase) {
      await this.vectorDatabase.close();
    }
  }

  /**
   * Inicializa os providers de embedding e banco vetorial
   */
  private async initializeProviders(): Promise<void> {
    // Inicializar embedding provider
    if (!this.embeddingProvider) {
      const embeddingFactory = new EmbeddingProviderFactory();
      this.embeddingProvider = await embeddingFactory.create(this.config.embedding);
      this.log.info(`Embedding provider inicializado: ${this.embeddingProvider.name}`);
    }

    // Inicializar vector database
    if (!this.vectorDatabase) {
      const vectorFactory = new VectorDatabaseFactory();
      
      // Usar storagePath da config se disponível
      const vectorConfig: VectorDatabaseConfig = {
        ...this.config.vectorDatabase,
        storagePath: this.config.vectorDatabase.storagePath || 
                     this.config.storage?.path || 
                     '.crag_cache',
      };

      this.vectorDatabase = await vectorFactory.create(vectorConfig);
      await this.vectorDatabase.initialize(this.config.projectId);
      this.log.info(`Vector database inicializado: ${this.vectorDatabase.name}`);
    }
  }
}

