import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Detect the correct PowerShell command for the current platform. */
export function getPwshCommand(): string {
  return platform() === 'win32' ? 'pwsh.exe' : 'pwsh';
}

/** Get the absolute path to a script in the repo's scripts/ directory. */
export function getScriptPath(scriptName: string): string {
  return join(getRepoRoot(), 'scripts', scriptName);
}

/** Get the repository root (two levels up from backend/src/utils/). */
export function getRepoRoot(): string {
  return join(__dirname, '..', '..', '..', '..');
}
