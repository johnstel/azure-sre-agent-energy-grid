import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

export interface ExecuteOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface ExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Cross-platform command executor using spawn() with structured args.
 * Never uses shell: true to prevent command injection.
 * Emits 'stdout', 'stderr', 'exit' events for streaming.
 */
export class CommandExecutor extends EventEmitter {
  private activeProcess: ChildProcess | null = null;

  /** Run a command and collect full output. */
  async execute(command: string, args: string[], options?: ExecuteOptions): Promise<ExecuteResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options?.cwd,
        env: options?.env ? { ...process.env, ...options.env } : process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        // Never shell: true — prevents injection
      });

      this.activeProcess = child;

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
        this.emit('stdout', chunk.toString());
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
        this.emit('stderr', chunk.toString());
      });

      let timeoutId: NodeJS.Timeout | undefined;
      if (options?.timeout) {
        timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Command timed out after ${options.timeout}ms`));
        }, options.timeout);
      }

      child.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.activeProcess = null;
        const result: ExecuteResult = {
          exitCode: code ?? 1,
          stdout: Buffer.concat(stdoutChunks).toString(),
          stderr: Buffer.concat(stderrChunks).toString(),
        };
        this.emit('exit', result);
        resolve(result);
      });

      child.on('error', (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.activeProcess = null;
        reject(err);
      });
    });
  }

  /** Spawn a command and stream output via events. Returns the ChildProcess PID. */
  stream(command: string, args: string[], options?: ExecuteOptions): number {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.activeProcess = child;

    child.stdout?.on('data', (chunk: Buffer) => {
      this.emit('stdout', chunk.toString());
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      this.emit('stderr', chunk.toString());
    });

    child.on('close', (code) => {
      this.activeProcess = null;
      this.emit('exit', { exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      this.activeProcess = null;
      this.emit('error', err);
    });

    return child.pid ?? -1;
  }

  /** Get the PID of the active process, if any. */
  get pid(): number | null {
    return this.activeProcess?.pid ?? null;
  }

  /** Kill the active process. */
  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    if (this.activeProcess) {
      return this.activeProcess.kill(signal);
    }
    return false;
  }
}
