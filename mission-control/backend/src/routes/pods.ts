import type { FastifyInstance } from 'fastify';
import { KubeClient } from '../services/KubeClient.js';

const kube = new KubeClient();

export function registerPodRoutes(app: FastifyInstance): void {
  app.get('/api/pods', async (_req, reply) => {
    const pods = await kube.getPods();
    return reply.send({ pods });
  });

  app.get('/api/services', async (_req, reply) => {
    const services = await kube.getServices();
    return reply.send({ services });
  });

  app.get('/api/events', async (_req, reply) => {
    const events = await kube.getEvents();
    return reply.send({ events });
  });
}
