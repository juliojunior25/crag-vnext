import { Command } from 'commander';
import { loadConfig } from '../../config/loader';
import { CRAGCore } from '../../core/CRAGCore';

export const watchCmd = new Command('index-watch')
  .description('Watch for changes and re-index periodically')
  .option('--interval <seconds>', 'Polling interval in seconds', '30')
  .option('--config <path>', 'Path to config YAML')
  .action(async (opts) => {
    try {
      const config = loadConfig(opts.config);
      const crag = new CRAGCore(config);

      await crag.watch(parseInt(opts.interval));
      // watch() runs indefinitely
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });
