import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Pod, Service, KubeEvent } from '../types/index.js';

const exec = promisify(execFile);

/**
 * Kubernetes client that wraps kubectl JSON output into typed objects.
 */
export class KubeClient {
  async getPods(namespace = 'energy'): Promise<Pod[]> {
    try {
      const { stdout } = await exec('kubectl', [
        'get', 'pods', '-n', namespace, '-o', 'json',
      ], { timeout: 15_000 });
      const data = JSON.parse(stdout);
      return (data.items ?? []).map((item: any) => {
        const containers = item.status?.containerStatuses ?? [];
        const readyCount = containers.filter((c: any) => c.ready).length;
        const totalCount = containers.length || (item.spec?.containers?.length ?? 0);
        return {
          name: item.metadata.name,
          namespace: item.metadata.namespace,
          status: item.status?.phase ?? 'Unknown',
          ready: readyCount === totalCount && totalCount > 0,
          restarts: containers.reduce((sum: number, c: any) => sum + (c.restartCount ?? 0), 0),
          age: item.metadata.creationTimestamp ?? '',
        } satisfies Pod;
      });
    } catch {
      return [];
    }
  }

  async getServices(namespace = 'energy'): Promise<Service[]> {
    try {
      const { stdout } = await exec('kubectl', [
        'get', 'services', '-n', namespace, '-o', 'json',
      ], { timeout: 15_000 });
      const data = JSON.parse(stdout);
      return (data.items ?? []).map((item: any) => ({
        name: item.metadata.name,
        namespace: item.metadata.namespace,
        type: item.spec.type ?? 'ClusterIP',
        clusterIP: item.spec.clusterIP ?? '',
        ports: (item.spec.ports ?? [])
          .map((p: any) => `${p.port}/${p.protocol ?? 'TCP'}`)
          .join(', '),
      } satisfies Service));
    } catch {
      return [];
    }
  }

  async getEvents(namespace = 'energy'): Promise<KubeEvent[]> {
    try {
      const { stdout } = await exec('kubectl', [
        'get', 'events', '-n', namespace, '-o', 'json',
        '--sort-by=.lastTimestamp',
      ], { timeout: 15_000 });
      const data = JSON.parse(stdout);
      return (data.items ?? []).slice(-50).map((item: any) => ({
        type: item.type ?? 'Normal',
        reason: item.reason ?? '',
        message: item.message ?? '',
        source: item.source?.component ?? '',
        timestamp: item.lastTimestamp ?? item.metadata?.creationTimestamp ?? '',
      } satisfies KubeEvent));
    } catch {
      return [];
    }
  }
}
