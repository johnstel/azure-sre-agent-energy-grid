import type { FastifyInstance } from 'fastify';
import { CustomerImpactService } from '../services/CustomerImpactService.js';

export function registerCustomerImpactRoutes(app: FastifyInstance, service = new CustomerImpactService()): void {
  app.get('/api/customer-impact', async (_req, reply) => reply.send(await service.getCustomerImpact()));
}
