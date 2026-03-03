import type { FastifyInstance } from 'fastify';
import type { CRAGCore } from '../../core/CRAGCore';
import { formatContextPack } from '../../utils/contextPack';

interface QueryBody {
  q: string;
  repos?: string[];
  lexicalK?: number;
  vectorK?: number;
  finalK?: number;
  maxRepos?: number;
  pack?: boolean;
}

export function registerQueryRoutes(app: FastifyInstance, crag: CRAGCore): void {
  app.post<{ Body: QueryBody }>('/query', async (request, reply) => {
    const { q, repos, lexicalK, vectorK, finalK, maxRepos, pack } = request.body;

    if (!q || typeof q !== 'string') {
      return reply.status(400).send({ error: 'Missing required field: q' });
    }

    const results = await crag.query(q, {
      repos,
      lexicalK,
      vectorK,
      finalK,
      maxRepos,
    });

    if (pack) {
      return reply.type('text/plain').send(formatContextPack(q, results));
    }

    return { query: q, count: results.length, results };
  });
}
