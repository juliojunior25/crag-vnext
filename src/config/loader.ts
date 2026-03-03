import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import type { RagConfig } from './schema';
import { settings } from './settings';

/**
 * Load RAG config from YAML file with defaults
 */
export function loadConfig(configPath?: string): RagConfig {
  const filePath = configPath || settings.RAG_CONFIG;
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, 'utf-8');
  const parsed = yaml.load(raw) as Partial<RagConfig>;

  if (!parsed || !parsed.repos || parsed.repos.length === 0) {
    throw new Error('Config must define at least one repo');
  }

  // Apply defaults
  const config: RagConfig = {
    repos: parsed.repos.map(repo => ({
      name: repo.name,
      path: path.resolve(path.dirname(resolved), repo.path),
      extensions: repo.extensions,
      excludeDirs: repo.excludeDirs,
      excludePatterns: repo.excludePatterns,
      buildDependencyGraph: repo.buildDependencyGraph ?? true,
    })),
    ignore: parsed.ignore ?? {
      dirs: ['node_modules', 'dist', 'build', '.git', 'coverage', '.next', 'out'],
      patterns: ['*.test.*', '*.spec.*', '*.stories.*'],
    },
    query: {
      lexicalK: parsed.query?.lexicalK ?? 30,
      vectorK: parsed.query?.vectorK ?? 30,
      finalK: parsed.query?.finalK ?? 10,
      lexicalWeight: parsed.query?.lexicalWeight ?? 0.55,
      maxRepos: parsed.query?.maxRepos ?? 5,
    },
    embeddingModel: parsed.embeddingModel ?? settings.EMBEDDING_MODEL,
    embeddingDimensions: parsed.embeddingDimensions ?? settings.EMBEDDING_DIMENSIONS,
    maxChunkSize: parsed.maxChunkSize ?? 3000,
    watchInterval: parsed.watchInterval ?? 30,
    reranker: parsed.reranker ? {
      enabled: parsed.reranker.enabled ?? false,
      model: parsed.reranker.model ?? 'qwen3-reranker:0.6b',
      candidateK: parsed.reranker.candidateK ?? 30,
    } : undefined,
    search: parsed.search ? {
      engine: parsed.search.engine ?? 'fts',
      bm25: parsed.search.bm25 ? {
        k1: parsed.search.bm25.k1 ?? 1.2,
        b: parsed.search.bm25.b ?? 0.75,
      } : undefined,
    } : undefined,
  };

  return config;
}
