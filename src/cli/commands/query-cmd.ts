import { Command } from 'commander';
import { loadConfig } from '../../config/loader';
import { CRAGCore } from '../../core/CRAGCore';
import { formatContextPack } from '../../utils/contextPack';
import { closePool } from '../../db/connection';

export const queryCmd = new Command('query')
  .description('Search indexed code')
  .argument('<text>', 'Search query text')
  .option('--pack', 'Output as context pack (for LLM)')
  .option('--show <n>', 'Number of results to show', '10')
  .option('--max-repos <n>', 'Maximum repos to search')
  .option('--lexical-k <n>', 'Lexical search candidates')
  .option('--vector-k <n>', 'Vector search candidates')
  .option('--final-k <n>', 'Final merged result count')
  .option('--config <path>', 'Path to config YAML')
  .action(async (text, opts) => {
    try {
      const config = loadConfig(opts.config);
      const crag = new CRAGCore(config);

      const results = await crag.query(text, {
        finalK: opts.finalK ? parseInt(opts.finalK) : parseInt(opts.show),
        lexicalK: opts.lexicalK ? parseInt(opts.lexicalK) : undefined,
        vectorK: opts.vectorK ? parseInt(opts.vectorK) : undefined,
        maxRepos: opts.maxRepos ? parseInt(opts.maxRepos) : undefined,
      });

      if (opts.pack) {
        console.log(formatContextPack(text, results));
      } else {
        if (results.length === 0) {
          console.log('No results found.');
          return;
        }

        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const score = (r.similarity * 100).toFixed(1);
          const repo = r.metadata.repo || '?';
          console.log(
            `[${i + 1}] ${r.filePath}:${r.metadata.startLine}-${r.metadata.endLine} ` +
            `(${score}% | ${r.source || 'hybrid'} | ${repo})`
          );
          if (r.metadata.symbol) {
            console.log(`    ${r.metadata.chunkType || ''} ${r.metadata.symbol}`);
          }
          console.log('');
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  });
