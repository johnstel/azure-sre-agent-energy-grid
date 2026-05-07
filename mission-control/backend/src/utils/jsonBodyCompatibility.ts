import type { FastifyInstance, FastifyRequest } from 'fastify';

const SCENARIO_MUTATION_PATH = /^\/api\/scenarios\/[^/?]+\/(?:enable|disable)$/;

export function addScenarioJsonBodyCompatibility(app: FastifyInstance): void {
  const defaultJsonParser = app.getDefaultJsonParser('error', 'error');

  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body: string, done) => {
    if (body.length === 0 && isScenarioMutationRequest(request)) {
      done(null, {});
      return;
    }

    defaultJsonParser(request, body, done);
  });
}

function isScenarioMutationRequest(request: FastifyRequest): boolean {
  if (request.method !== 'POST') return false;

  const [pathname] = request.url.split('?');
  return pathname === '/api/scenarios/fix-all' || SCENARIO_MUTATION_PATH.test(pathname ?? '');
}
