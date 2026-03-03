import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { IRepositoryIndexer, RepositoryIndexerConfig } from '../interfaces/IRepositoryIndexer';
import type { IndexedRepository, IndexingConfig, IndexingStats } from '../models/IndexedRepository';
import type { RAGQuery, SemanticSearchResult } from '../models/RAGQuery';
import type { DependencyGraph } from '../models/FileMetadata';
import type { IEmbeddingProvider } from '../interfaces/IEmbeddingProvider';
import type { IChunkingStrategy } from '../interfaces/IChunkingStrategy';
import type { CodeVector } from '../models/CodeChunk';
import type { PostgresVectorDatabase } from '../backends/PostgresVectorDatabase';
import type { RepoSpec } from '../config/schema';
import { FileCollector } from '../services/FileCollector';
import { DependencyGraphBuilder } from '../services/DependencyGraphBuilder';
import { GitService } from '../services/git/GitService';
import { createTreeLogger } from '../utils/logger';
import type { TreeLogger } from '../utils/treeLogger';
import { inferLanguageFromFilePath } from '../utils/language';

/**
 * RepositoryIndexer
 * Multi-repo aware indexing with incremental git diff support
 */
export class RepositoryIndexer implements IRepositoryIndexer {
  private log: TreeLogger;
  private config: RepositoryIndexerConfig;
  private embeddingProvider: IEmbeddingProvider;
  private vectorDatabase: PostgresVectorDatabase;
  private chunkingStrategy: IChunkingStrategy;
  private graphBuilder: DependencyGraphBuilder;
  private gitService: GitService;

  private currentRepository: IndexedRepository | null = null;

  constructor(config: RepositoryIndexerConfig & {
    embeddingProvider: IEmbeddingProvider;
    vectorDatabase: PostgresVectorDatabase;
    chunkingStrategy: IChunkingStrategy;
  }) {
    this.log = createTreeLogger({ component: 'RepositoryIndexer' }, { structuredLogger: false });
    this.config = config;
    this.embeddingProvider = config.embeddingProvider;
    this.vectorDatabase = config.vectorDatabase;
    this.chunkingStrategy = config.chunkingStrategy;
    this.graphBuilder = new DependencyGraphBuilder();
    this.gitService = new GitService();
  }

  /**
   * Build a FileCollector configured for a specific repo
   */
  private buildFileCollector(repo: RepoSpec): FileCollector {
    const excludeDirs = new Set(
      (repo.excludeDirs || ['node_modules', 'dist', 'build', '.git', 'coverage'])
        .map(d => d.toLowerCase())
    );

    return new FileCollector({
      validExtensions: repo.extensions || undefined,
      excludeDirectories: excludeDirs,
      excludePatterns: repo.excludePatterns,
    });
  }

  /**
   * Check if a relative path should be included for a repo
   */
  private shouldIncludeFile(relPath: string, repo: RepoSpec): boolean {
    // Check extension
    if (repo.extensions && repo.extensions.length > 0) {
      const ext = path.extname(relPath);
      if (!repo.extensions.includes(ext)) return false;
    }

    // Check excluded directories
    if (repo.excludeDirs) {
      const parts = relPath.split(path.sep);
      for (const dir of repo.excludeDirs) {
        if (parts.includes(dir)) return false;
      }
    }

    // Check exclude patterns (glob-like: *.test.*, *.spec.*, etc.)
    if (repo.excludePatterns) {
      const fileName = path.basename(relPath);
      for (const pattern of repo.excludePatterns) {
        const regex = new RegExp(
          '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
        );
        if (regex.test(fileName)) return false;
      }
    }

    return true;
  }

  /**
   * Index a single repo with incremental support
   */
  async indexRepo(repo: RepoSpec, full?: boolean): Promise<IndexingStats> {
    const startTime = Date.now();
    this.log.info(`Indexing repo "${repo.name}" at ${repo.path}...`);

    const isGit = this.gitService.isGitRepo(repo.path);
    let headCommit: string | undefined;
    let filesToProcess: string[] = [];
    let filesToDelete: string[] = [];

    const fileCollector = this.buildFileCollector(repo);

    if (isGit) {
      headCommit = this.gitService.getHead(repo.path);
      const repoState = await this.vectorDatabase.getRepoState(repo.name);

      if (!full && repoState?.lastIndexedCommit) {
        if (repoState.lastIndexedCommit === headCommit) {
          this.log.info(`Repo "${repo.name}" is up-to-date (${headCommit.substring(0, 8)}), skipping.`);
          return {
            duration: Date.now() - startTime,
            successCount: 0,
            errorCount: 0,
            totalLines: 0,
            embeddingProvider: this.embeddingProvider.name,
            vectorBackend: this.vectorDatabase.name,
            chunkingStrategy: this.chunkingStrategy.name,
          };
        }

        // Incremental: only changed files
        this.log.info(`Incremental: ${repoState.lastIndexedCommit.substring(0, 8)} → ${headCommit.substring(0, 8)}`);
        const changes = this.gitService.getChangedFiles(repo.path, repoState.lastIndexedCommit, headCommit);

        const allChanged = [...changes.added, ...changes.modified]
          .filter(f => this.shouldIncludeFile(f, repo));

        filesToProcess = allChanged
          .map(f => path.join(repo.path, f))
          .filter(f => fs.existsSync(f));

        filesToDelete = [...changes.deleted, ...changes.modified]
          .filter(f => this.shouldIncludeFile(f, repo))
          .map(f => path.relative(repo.path, path.join(repo.path, f)));

        this.log.info(`Changed files: +${changes.added.length} ~${changes.modified.length} -${changes.deleted.length} (${filesToProcess.length} to process after filters)`);
      } else {
        // Full reindex
        this.log.info('Full reindex');
        const result = await fileCollector.collect([repo.path]);
        filesToProcess = result.files;
      }
    } else {
      // Not a git repo, full collection
      const result = await fileCollector.collect([repo.path]);
      filesToProcess = result.files;
    }

    // Deactivate deleted/modified files
    for (const relPath of filesToDelete) {
      await this.vectorDatabase.deactivateByRepoAndPath(repo.name, relPath);
    }

    // Process files
    let successCount = 0;
    let errorCount = 0;
    let totalChunks = 0;

    for (let i = 0; i < filesToProcess.length; i++) {
      const filePath = filesToProcess[i];
      const relPath = path.relative(repo.path, filePath);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const language = inferLanguageFromFilePath(filePath) || 'text';

        // Deactivate old chunks for this file
        await this.vectorDatabase.deactivateByRepoAndPath(repo.name, relPath);

        // Chunk the file
        const chunks = await this.chunkingStrategy.chunk(filePath, content, language);

        if (chunks.length === 0) {
          successCount++;
          continue;
        }

        // Batch embed all chunks
        const texts = chunks.map(c => c.content);
        const embeddings = await this.embeddingProvider.embedBatch(texts);

        // Build vectors for upsert
        const vectors: CodeVector[] = chunks.map((chunk, idx) => ({
          id: `${repo.name}:${relPath}:${idx}`,
          filePath: relPath,
          content: chunk.content,
          embedding: embeddings[idx],
          metadata: {
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            astNode: chunk.astNode,
            language,
            symbol: chunk.symbol,
            chunkType: chunk.chunkType,
            repo: repo.name,
            fileType: path.extname(filePath),
            directory: path.dirname(relPath),
          },
          contentHash: createHash('sha256').update(chunk.content).digest('hex'),
          isActive: true,
        }));

        await this.vectorDatabase.upsertBatch(vectors);
        totalChunks += vectors.length;
        successCount++;
      } catch (error) {
        errorCount++;
        const msg = error instanceof Error ? error.message : String(error);
        this.log.error(`Failed to process ${relPath}: ${msg}`);
      }

      if ((i + 1) % 10 === 0 || i === filesToProcess.length - 1) {
        this.log.progress(i + 1, filesToProcess.length, 'Processing files');
      }
    }

    if (filesToProcess.length > 0) {
      this.log.progressComplete();
    }

    // Update repo state
    if (headCommit) {
      await this.vectorDatabase.upsertRepoState(repo.name, repo.path, headCommit);
    }

    const duration = Date.now() - startTime;
    this.log.success(
      `Repo "${repo.name}": ${totalChunks} chunks from ${successCount} files in ${(duration / 1000).toFixed(1)}s`
    );

    return {
      duration,
      successCount,
      errorCount,
      totalLines: totalChunks, // approximate
      embeddingProvider: this.embeddingProvider.name,
      vectorBackend: this.vectorDatabase.name,
      chunkingStrategy: this.chunkingStrategy.name,
    };
  }

  /**
   * Legacy index method (indexes the single configured project)
   */
  async index(config?: IndexingConfig): Promise<IndexedRepository> {
    const startTime = Date.now();

    await this.vectorDatabase.initialize(this.config.projectId);

    const repo: RepoSpec = {
      name: this.config.projectId,
      path: this.config.projectPath,
    };

    const stats = await this.indexRepo(repo, config?.full);

    const count = await this.vectorDatabase.count();

    const repository: IndexedRepository = {
      projectId: this.config.projectId,
      projectPath: this.config.projectPath,
      indexedAt: new Date(),
      totalFiles: stats.successCount,
      totalChunks: count,
      totalVectors: count,
      files: [],
      stats,
    };

    this.currentRepository = repository;
    return repository;
  }

  async query(query: RAGQuery): Promise<SemanticSearchResult[]> {
    const queryEmbedding = await this.embeddingProvider.embed(query.text, true);

    const topK = query.topK || 10;
    const results = await this.vectorDatabase.search(
      queryEmbedding,
      topK,
      query.filters
    );

    let filteredResults = results;
    if (query.minSimilarity !== undefined) {
      filteredResults = results.filter(r => r.similarity >= query.minSimilarity!);
    }

    return filteredResults;
  }

  async save(_repository: IndexedRepository): Promise<void> {
    // State is persisted in Postgres, no file-based save needed
  }

  async load(): Promise<IndexedRepository | null> {
    return this.currentRepository;
  }

  getDependencyGraph(): DependencyGraph | null {
    return this.currentRepository?.dependencyGraph || null;
  }

  getRepository(): IndexedRepository | null {
    return this.currentRepository;
  }

  async clear(): Promise<void> {
    await this.vectorDatabase.clear();
    this.currentRepository = null;
    this.log.info('Cleared all indexed data');
  }
}
