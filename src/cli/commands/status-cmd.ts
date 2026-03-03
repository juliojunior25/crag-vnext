import { Command } from 'commander';
import { loadConfig } from '../../config/loader';
import { CRAGCore } from '../../core/CRAGCore';
import { closePool } from '../../db/connection';

export const statusCmd = new Command('status')
  .description('Show indexing status for all repos')
  .option('--config <path>', 'Path to config YAML')
  .action(async (opts) => {
    try {
      const config = loadConfig(opts.config);
      const crag = new CRAGCore(config);

      const statuses = await crag.getStatus();

      console.log('Repository Status:');
      console.log('─'.repeat(80));

      for (const s of statuses) {
        const commit = s.lastCommit ? s.lastCommit.substring(0, 8) : 'never';
        const time = s.lastIndexedAt
          ? new Date(s.lastIndexedAt).toLocaleString()
          : 'never';

        console.log(`  ${s.repo}`);
        console.log(`    path:    ${s.path}`);
        console.log(`    commit:  ${commit}`);
        console.log(`    indexed: ${time}`);
        console.log(`    chunks:  ${s.chunkCount}`);
        console.log('');
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  });
