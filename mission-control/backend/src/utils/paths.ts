import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';
import { access, constants } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the PowerShell executable path.
 * Checks common installation paths before falling back to PATH resolution.
 * Returns executable name/path suitable for execFile/spawn.
 */
export async function resolvePwsh(): Promise<string> {
  const isWindows = platform() === 'win32';

  // Define search paths in priority order
  const searchPaths: string[] = isWindows
    ? [
        // Windows: check Program Files paths first
        'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        'C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe',
        join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
        join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'PowerShell', '7', 'pwsh.exe'),
        // Fallback to bare command (PATH resolution)
        'pwsh.exe',
      ]
    : [
        // macOS/Linux: check Homebrew and standard paths
        '/opt/homebrew/bin/pwsh',       // Apple Silicon Homebrew
        '/usr/local/bin/pwsh',           // Intel Homebrew / standard
        '/usr/bin/pwsh',                 // System install
        join(process.env.HOME ?? '/root', '.dotnet', 'tools', 'pwsh'), // dotnet tool install
        // Fallback to bare command (PATH resolution)
        'pwsh',
      ];

  // Check each path for executability
  for (const candidate of searchPaths) {
    try {
      await access(candidate, constants.X_OK);
      return candidate; // Found executable
    } catch {
      // Not found or not executable, continue
    }
  }

  // Fallback: return bare command name and let execFile try PATH
  return isWindows ? 'pwsh.exe' : 'pwsh';
}

/** Synchronous version: Detect the correct PowerShell command for the current platform. */
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
