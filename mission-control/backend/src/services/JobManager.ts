import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { CommandExecutor, type ExecuteOptions } from './CommandExecutor.js';
import type { Job } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type JobStatus = Job['status'];

interface ManagedJob extends Job {
  executor: CommandExecutor | null;
}

/**
 * Manages long-running command jobs with a state machine:
 * pending → running → completed | failed | cancelled
 *
 * Enforces one active destructive operation at a time.
 * Emits events for WebSocket streaming: 'job:start', 'job:stdout', 'job:stderr', 'job:complete'
 */
export class JobManager extends EventEmitter {
  private jobs = new Map<string, ManagedJob>();

  /** Create a new job and start it immediately. */
  start(
    label: string,
    command: string,
    args: string[],
    options?: ExecuteOptions,
  ): Job {
    // Enforce single active destructive job
    const active = this.getActiveJob();
    if (active) {
      throw new Error(
        `Cannot start "${label}" — job "${active.requestId}" (${active.command}) is already running. Cancel it first.`,
      );
    }

    const id = randomUUID();
    const job: ManagedJob = {
      requestId: id,
      command: label,
      status: 'pending',
      createdAt: new Date().toISOString(),
      logs: [],
      executor: null,
    };

    this.jobs.set(id, job);
    this.emit('job:created', this.toPublic(job));

    // Start async execution
    this.runJob(job, command, args, options);

    return this.toPublic(job);
  }

  /** Cancel a running job by ID. */
  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || (job.status !== 'running' && job.status !== 'pending')) {
      return false;
    }

    if (job.executor) {
      job.executor.kill('SIGTERM');
      // Give it a moment, then force kill
      setTimeout(() => {
        if (job.executor) job.executor.kill('SIGKILL');
      }, 5000);
    }

    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();
    job.executor = null;
    this.emit('job:complete', this.toPublic(job));
    logger.info({ jobId }, 'Job cancelled');
    return true;
  }

  /** Get a job by ID. */
  getStatus(jobId: string): Job | undefined {
    const job = this.jobs.get(jobId);
    return job ? this.toPublic(job) : undefined;
  }

  /** List all jobs (most recent first). */
  list(): Job[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(this.toPublic);
  }

  /** Get the currently running job, if any. */
  getActiveJob(): Job | undefined {
    for (const job of this.jobs.values()) {
      if (job.status === 'running' || job.status === 'pending') {
        return this.toPublic(job);
      }
    }
    return undefined;
  }

  private async runJob(
    job: ManagedJob,
    command: string,
    args: string[],
    options?: ExecuteOptions,
  ): Promise<void> {
    const executor = new CommandExecutor();
    job.executor = executor;
    job.status = 'running';

    this.emit('job:start', this.toPublic(job));
    logger.info({ jobId: job.requestId, command, args }, 'Job started');

    executor.on('stdout', (data: string) => {
      job.logs.push(data);
      this.emit('job:stdout', { jobId: job.requestId, data });
    });

    executor.on('stderr', (data: string) => {
      job.logs.push(data);
      this.emit('job:stderr', { jobId: job.requestId, data });
    });

    try {
      const result = await executor.execute(command, args, options);
      if ((job as ManagedJob).status === 'cancelled') return;

      job.exitCode = result.exitCode;
      job.status = result.exitCode === 0 ? 'completed' : 'failed';
      job.completedAt = new Date().toISOString();
      job.executor = null;

      this.emit('job:complete', this.toPublic(job));
      logger.info({ jobId: job.requestId, exitCode: result.exitCode }, 'Job complete');
    } catch (err) {
      if ((job as ManagedJob).status === 'cancelled') return;

      job.status = 'failed';
      job.completedAt = new Date().toISOString();
      job.exitCode = 1;
      job.executor = null;

      const message = err instanceof Error ? err.message : String(err);
      job.logs.push(`Error: ${message}`);
      this.emit('job:complete', this.toPublic(job));
      logger.error({ jobId: job.requestId, err: message }, 'Job failed');
    }
  }

  /** Strip internal fields from a job for public API. */
  private toPublic(job: ManagedJob): Job {
    return {
      requestId: job.requestId,
      command: job.command,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      exitCode: job.exitCode,
      logs: job.logs,
    };
  }
}
