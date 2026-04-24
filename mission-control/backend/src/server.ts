import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './utils/logger.js';
import { JobManager } from './services/JobManager.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerDeployRoutes } from './routes/deploy.js';
import { registerDestroyRoutes } from './routes/destroy.js';
import { registerPodRoutes } from './routes/pods.js';
import { registerScenarioRoutes } from './routes/scenarios.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3333;
const HOST = '127.0.0.1';

async function start() {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  });
  const jobManager = new JobManager();

  // CORS — allow localhost origins in dev
  await app.register(fastifyCors, {
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      `http://localhost:${PORT}`,
      `http://127.0.0.1:${PORT}`,
    ],
  });

  // WebSocket support
  await app.register(fastifyWebsocket);

  // WebSocket endpoint — streams job events to connected clients
  app.register(async function wsRoutes(fastify) {
    fastify.get('/ws', { websocket: true }, (socket) => {
      const onStart = (job: any) => socket.send(JSON.stringify({ type: 'job:start', job }));
      const onStdout = (data: any) => socket.send(JSON.stringify({ type: 'job:stdout', jobId: data.jobId, data: data.data }));
      const onStderr = (data: any) => socket.send(JSON.stringify({ type: 'job:stderr', jobId: data.jobId, data: data.data }));
      const onComplete = (job: any) => socket.send(JSON.stringify({ type: 'job:complete', job }));

      jobManager.on('job:start', onStart);
      jobManager.on('job:stdout', onStdout);
      jobManager.on('job:stderr', onStderr);
      jobManager.on('job:complete', onComplete);

      socket.on('close', () => {
        jobManager.off('job:start', onStart);
        jobManager.off('job:stdout', onStdout);
        jobManager.off('job:stderr', onStderr);
        jobManager.off('job:complete', onComplete);
      });
    });
  });

  // Serve built frontend in production
  const frontendDist = join(__dirname, '..', '..', 'frontend', 'dist');
  if (existsSync(frontendDist)) {
    await app.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
      wildcard: false,
    });
  }

  // Register API routes
  registerHealthRoutes(app);
  registerDeployRoutes(app, jobManager);
  registerDestroyRoutes(app, jobManager);
  registerPodRoutes(app);
  registerScenarioRoutes(app);

  // SPA fallback — must be after API routes
  if (existsSync(frontendDist)) {
    app.setNotFoundHandler((_req, reply) => {
      return reply.sendFile('index.html', frontendDist);
    });
  }

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Mission Control backend listening on http://${HOST}:${PORT}`);

  // Auto-open browser in production mode (when serving built frontend)
  if (existsSync(frontendDist) && !process.env.NO_OPEN) {
    const url = `http://localhost:${PORT}`;
    const { exec } = await import('node:child_process');
    const openCmd = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';
    exec(`${openCmd} ${url}`);
  }
}

start().catch((err) => {
  logger.error(err, 'Failed to start Mission Control backend');
  process.exit(1);
});
