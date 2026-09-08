import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import pino from 'pino';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: process.env['NODE_ENV'] !== 'production'
    ? { target: 'pino/file', options: { destination: 1 } }
    : undefined,
});

/** Truthy string values accepted for boolean-like environment flags. */
const TRUE_FLAG_VALUES = new Set(['1', 'true', 'on', 'yes']);

/** A single structured entry that can be rendered as a Trace64 log line. */
export interface Trace64LogEntry {
  level?: string;
  message: string;
  timestamp?: number;
  fields?: Record<string, unknown>;
}

export interface WriteTrace64LogOptions {
  env?: NodeJS.ProcessEnv;
  write?: (line: string, options: { env: NodeJS.ProcessEnv }) => void;
  spawnCommand?: (command: string, args: string[]) => void;
}

export function shouldUseTrace64Logging(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env['TRACE64_LOG_ENABLED'] ?? env['TRACE64_ENABLED'];
  if (!flag) {
    return false;
  }

  return TRUE_FLAG_VALUES.has(flag.trim().toLowerCase());
}

function formatTrace64Value(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function buildTrace64LogLine(entry: Trace64LogEntry): string {
  const timestamp = new Date(entry.timestamp ?? Date.now()).toISOString();
  const level = (entry.level ?? 'info').toUpperCase();
  const message = entry.message.replace(/"/g, '\\"');
  const fieldEntries = Object.entries(entry.fields ?? {});
  const fieldsPart = fieldEntries.length > 0
    ? ` ${fieldEntries.map(([key, value]) => `${key}=${formatTrace64Value(value)}`).join(' ')}`
    : '';

  return `${timestamp} ${level} "${message}"${fieldsPart}`;
}

export function buildTrace64Script(logFile: string, entries: Trace64LogEntry[]): string {
  const target = logFile.replace(/\\/g, '/');
  const lines = [
    `LOG.OPEN "${target}"`,
    ...entries.map((entry) => {
      const rendered = buildTrace64LogLine(entry).replace(/"/g, '\\"');
      return `PRINT "${rendered}"`;
    }),
    'LOG.CLOSE',
  ];

  return `${lines.join('\n')}\n`;
}

function defaultTrace64Writer(line: string, { env }: { env: NodeJS.ProcessEnv }): void {
  const target = env['TRACE64_LOG_FILE'] ?? 'trace64.log';
  fs.appendFileSync(target, `${line}\n`);
}

export function writeTrace64Log(entry: Trace64LogEntry, options: WriteTrace64LogOptions = {}): void {
  const env = options.env ?? process.env;
  if (!shouldUseTrace64Logging(env)) {
    return;
  }

  const line = buildTrace64LogLine(entry);
  const trace64Exe = env['TRACE64_EXE'] ?? env['TRACE64_EXE_PATH'];
  const logFile = env['TRACE64_LOG_FILE'] ?? 'trace64.log';
  const scriptFile = env['TRACE64_SCRIPT_FILE'] ?? path.join(path.dirname(logFile), `${path.basename(logFile, path.extname(logFile))}.cmm`);

  if (options.write) {
    options.write(line, { env });
    return;
  }

  if (trace64Exe) {
    const script = buildTrace64Script(logFile, [entry]);
    const scriptDir = path.dirname(scriptFile);
    fs.mkdirSync(scriptDir, { recursive: true });
    fs.writeFileSync(scriptFile, script, 'utf8');
    const system = options.spawnCommand ?? ((command: string, args: string[]) => spawn(command, args, { stdio: 'ignore' }));
    system(trace64Exe, ['-s', scriptFile]);
    return;
  }

  const fileDir = path.dirname(logFile);
  if (fileDir && fileDir !== '.') {
    fs.mkdirSync(fileDir, { recursive: true });
  }
  defaultTrace64Writer(line, { env });
}
