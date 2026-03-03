#!/usr/bin/env node
import { Command } from 'commander';
import { indexCmd } from './commands/index-cmd';
import { queryCmd } from './commands/query-cmd';
import { watchCmd } from './commands/watch-cmd';
import { statusCmd } from './commands/status-cmd';
import { healthCmd } from './commands/health-cmd';

const program = new Command();

program
  .name('crag')
  .description('Code RAG - Semantic code search with hybrid indexing')
  .version('1.0.0');

program.addCommand(indexCmd);
program.addCommand(queryCmd);
program.addCommand(watchCmd);
program.addCommand(statusCmd);
program.addCommand(healthCmd);

program.parse();
