import type { FastifyInstance, FastifyReply } from 'fastify';
import { KubeClient, KubeClientError, KubeInputError } from '../services/KubeClient.js';

const kube = new KubeClient();

export function registerPodRoutes(app: FastifyInstance): void {
  app.get('/api/pods', async (_req, reply) => {
    try {
      const pods = await kube.getPods();
      return reply.send({ pods });
    } catch (err) {
      return sendKubeError(reply, err);
    }
  });

  app.get('/api/services', async (_req, reply) => {
    try {
      const services = await kube.getServices();
      return reply.send({ services });
    } catch (err) {
      return sendKubeError(reply, err);
    }
  });

  app.get('/api/deployments', async (_req, reply) => {
    try {
      const deployments = await kube.getDeployments();
      return reply.send({ deployments });
    } catch (err) {
      return sendKubeError(reply, err);
    }
  });

  app.get('/api/events', async (_req, reply) => {
    try {
      const events = await kube.getEvents();
      return reply.send({ events });
    } catch (err) {
      return sendKubeError(reply, err);
    }
  });

  app.get('/api/inventory', async (_req, reply) => {
    try {
      return reply.send(await kube.getInventory());
    } catch (err) {
      return sendKubeError(reply, err);
    }
  });

  app.get<{ Params: { name: string }; Querystring: { lines?: string } }>('/api/pods/:name/logs', async (req, reply) => {
    try {
      const lines = parseLineCount(req.query.lines);
      return reply.send(await kube.getPodLogs(req.params.name, lines));
    } catch (err) {
      return sendKubeError(reply, err);
    }
  });

  app.get<{ Params: { name: string } }>('/api/services/:name/endpoints', async (req, reply) => {
    try {
      return reply.send(await kube.getServiceEndpoints(req.params.name));
    } catch (err) {
      return sendKubeError(reply, err);
    }
  });
}

function parseLineCount(lines: string | undefined): number | undefined {
  if (lines === undefined) return undefined;
  if (!/^\d+$/.test(lines)) {
    throw new KubeInputError('Query parameter "lines" must be a positive integer.');
  }
  return Number(lines);
}

function sendKubeError(reply: FastifyReply, err: unknown) {
  if (err instanceof KubeInputError || err instanceof KubeClientError) {
    return reply.status(err instanceof KubeInputError ? 400 : err.statusCode).send({ error: err.message });
  }

  const message = err instanceof Error ? err.message : String(err);
  return reply.status(500).send({ error: message });
}
