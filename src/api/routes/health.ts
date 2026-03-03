import type { FastifyInstance } from 'fastify';
import type { CRAGCore } from '../../core/CRAGCore';

export function registerHealthRoutes(app: FastifyInstance, crag: CRAGCore): void {
  app.get('/health', async (_request, reply) => {
    const health = await crag.healthCheck();

    const status = health.db && health.ollama ? 200 : 503;
    return reply.status(status).send({
      status: status === 200 ? 'healthy' : 'unhealthy',
      postgres: health.db ? 'ok' : 'fail',
      ollama: health.ollama ? 'ok' : 'fail',
    });
  });
}
