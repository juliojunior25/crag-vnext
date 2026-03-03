import type { FastifyInstance } from 'fastify';
import type { CRAGCore } from '../../core/CRAGCore';

interface IndexBody {
  repo?: string;
  full?: boolean;
}

export function registerIndexRoutes(app: FastifyInstance, crag: CRAGCore): void {
  app.post<{ Body: IndexBody }>('/index', async (request, reply) => {
    const { repo, full } = request.body || {};

    if (repo) {
      await crag.indexRepo(repo, full);
    } else {
      await crag.indexAll(full);
    }

    return { status: 'ok' };
  });

  app.get('/status', async () => {
    const statuses = await crag.getStatus();
    return { repos: statuses };
  });
}
