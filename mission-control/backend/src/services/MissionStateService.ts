import { KubeClient } from './KubeClient.js';
import { collectPreflight } from './PreflightService.js';
import { getScenarios } from './ScenarioService.js';
import type { JobManager } from './JobManager.js';
import type { Deployment, Job, KubeEvent, MissionState, Pod, Service } from '../types/index.js';

const kube = new KubeClient();

function withoutLogs(job: Job): Omit<Job, 'logs'> {
  const { logs: _logs, ...publicJob } = job;
  return publicJob;
}

export async function collectMissionState(jobManager: JobManager): Promise<MissionState> {
  const [preflight, podsResult, servicesResult, deploymentsResult, eventsResult] = await Promise.all([
    collectPreflight(),
    collectKube('pods', kube.getPods(), [] as Pod[]),
    collectKube('services', kube.getServices(), [] as Service[]),
    collectKube('deployments', kube.getDeployments(), [] as Deployment[]),
    collectKube('events', kube.getEvents(), [] as KubeEvent[]),
  ]);

  const activeJob = jobManager.getActiveJob();
  const recentJobs = jobManager.list().slice(0, 5);
  const errors = [podsResult.error, servicesResult.error, deploymentsResult.error, eventsResult.error].filter((error): error is string => Boolean(error));

  return {
    collectedAt: new Date().toISOString(),
    preflight,
    cluster: {
      namespace: 'energy',
      pods: podsResult.data,
      services: servicesResult.data,
      deployments: deploymentsResult.data,
      events: eventsResult.data,
      errors: errors.length > 0 ? errors : undefined,
    },
    scenarios: getScenarios(),
    operations: {
      activeJob: activeJob ? withoutLogs(activeJob) : undefined,
      recentJobs: recentJobs.map(withoutLogs),
    },
  };
}

async function collectKube<T>(resource: string, promise: Promise<T>, fallback: T): Promise<{ data: T; error?: string }> {
  try {
    return { data: await promise };
  } catch (err) {
    return { data: fallback, error: stateError(resource, err) };
  }
}

function stateError(resource: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `Unable to collect ${resource}: ${message}`;
}
