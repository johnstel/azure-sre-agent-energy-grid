import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';
import type { ToolStatus } from '../types/index.js';

const execFileAsync = promisify(execFile);

interface ToolProbe {
  name: string;
  command: string;
  args: string[];
  parseVersion: (stdout: string) => string;
}

const TOOLS: ToolProbe[] = [
  {
    name: 'pwsh',
    command: platform() === 'win32' ? 'pwsh.exe' : 'pwsh',
    args: ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'],
    parseVersion: (out) => out.trim(),
  },
  {
    name: 'az',
    command: 'az',
    args: ['version', '--output', 'json'],
    parseVersion: (out) => {
      try {
        const parsed = JSON.parse(out);
        return parsed['azure-cli'] ?? 'unknown';
      } catch {
        return 'unknown';
      }
    },
  },
  {
    name: 'kubectl',
    command: 'kubectl',
    args: ['version', '--client', '--output', 'json'],
    parseVersion: (out) => {
      try {
        const parsed = JSON.parse(out);
        return parsed.clientVersion?.gitVersion ?? 'unknown';
      } catch {
        return 'unknown';
      }
    },
  },
];

async function probeOne(tool: ToolProbe): Promise<ToolStatus> {
  try {
    const { stdout } = await execFileAsync(tool.command, tool.args, {
      timeout: 10_000,
      env: { ...process.env },
    });
    return {
      name: tool.name,
      available: true,
      version: tool.parseVersion(stdout),
      path: tool.command,
    };
  } catch {
    return { name: tool.name, available: false };
  }
}

/** Detect availability of required CLI tools (pwsh, az, kubectl). */
export async function detectTools(): Promise<ToolStatus[]> {
  return Promise.all(TOOLS.map(probeOne));
}
