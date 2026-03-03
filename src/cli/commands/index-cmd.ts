import { Command } from 'commander';
import { loadConfig } from '../../config/loader';
import { CRAGCore } from '../../core/CRAGCore';
import { closePool } from '../../db/connection';

export const indexCmd = new Command('index')
  .description('Index repositories')
  .option('--full', 'Force full reindex (ignore incremental)')
  .option('--repo <name>', 'Index only a specific repo')
  .option('--config <path>', 'Path to config YAML')
  .action(async (opts) => {
    try {
      const config = loadConfig(opts.config);
      const crag = new CRAGCore(config);

      if (opts.repo) {
        await crag.indexRepo(opts.repo, opts.full);
      } else {
        await crag.indexAll(opts.full);
      }

      console.log('Indexing complete.');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  });
