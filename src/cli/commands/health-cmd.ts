import { Command } from 'commander';
import { loadConfig } from '../../config/loader';
import { CRAGCore } from '../../core/CRAGCore';
import { closePool } from '../../db/connection';

export const healthCmd = new Command('health')
  .description('Check health of DB and Ollama')
  .option('--config <path>', 'Path to config YAML')
  .action(async (opts) => {
    try {
      const config = loadConfig(opts.config);
      const crag = new CRAGCore(config);

      const health = await crag.healthCheck();

      console.log('Health Check:');
      console.log(`  Postgres: ${health.db ? 'OK' : 'FAIL'}`);
      console.log(`  Ollama:   ${health.ollama ? 'OK' : 'FAIL'}`);

      if (!health.db || !health.ollama) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  });
