import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { RagConfig } from '../config/schema';
import { CRAGCore } from '../core/CRAGCore';
import { registerQueryRoutes } from './routes/query';
import { registerIndexRoutes } from './routes/index-routes';
import { registerHealthRoutes } from './routes/health';
import { settings } from '../config/settings';

export async function createServer(config: RagConfig) {
  const app = Fastify({ logger: true });
  await app.register(cors);

  const crag = new CRAGCore(config);

  // Register routes
  registerQueryRoutes(app, crag);
  registerIndexRoutes(app, crag);
  registerHealthRoutes(app, crag);

  return { app, crag };
}

/**
 * Start the API server (used as entrypoint)
 */
export async function startServer(config: RagConfig): Promise<void> {
  const { app } = await createServer(config);

  const port = settings.API_PORT;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`CRAG API listening on :${port}`);
}
