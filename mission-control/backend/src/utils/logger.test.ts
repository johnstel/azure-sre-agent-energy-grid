import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildTrace64LogLine,
  buildTrace64Script,
  logger,
  shouldUseTrace64Logging,
  writeTrace64Log,
} from './logger.js';

test('logger singleton is a usable Pino instance by default', () => {
  assert.equal(typeof logger.info, 'function');
  assert.equal(typeof logger.error, 'function');
  assert.equal(logger.level, process.env['LOG_LEVEL'] ?? 'info');
});

test('shouldUseTrace64Logging is disabled by default (no env flags set)', () => {
  assert.equal(shouldUseTrace64Logging({}), false);
});

test('shouldUseTrace64Logging is disabled for falsy/unknown flag values', () => {
  for (const value of ['false', '0', 'off', 'no', 'nonsense', '']) {
    assert.equal(shouldUseTrace64Logging({ TRACE64_LOG_ENABLED: value }), false);
  }
});

test('shouldUseTrace64Logging accepts common truthy flag values', () => {
  for (const value of ['1', 'true', 'TRUE', 'on', 'ON', 'yes']) {
    assert.equal(shouldUseTrace64Logging({ TRACE64_LOG_ENABLED: value }), true);
  }
});

test('shouldUseTrace64Logging honors the TRACE64_ENABLED alias', () => {
  assert.equal(shouldUseTrace64Logging({ TRACE64_ENABLED: 'true' }), true);
  assert.equal(shouldUseTrace64Logging({ TRACE64_ENABLED: 'false' }), false);
});

test('shouldUseTrace64Logging prefers TRACE64_LOG_ENABLED over the alias', () => {
  assert.equal(
    shouldUseTrace64Logging({ TRACE64_LOG_ENABLED: 'false', TRACE64_ENABLED: 'true' }),
    false,
  );
});

test('buildTrace64LogLine renders a timestamped, plain-text TRACE32-style log line', () => {
  const line = buildTrace64LogLine({ level: 'warn', message: 'pod restarted', timestamp: 1700000000000 });
  assert.equal(line, '2023-11-14T22:13:20.000Z WARN "pod restarted"');
});

test('buildTrace64LogLine defaults level to INFO and timestamp to now', () => {
  const before = Date.now();
  const line = buildTrace64LogLine({ message: 'hello' });
  const after = Date.now();

  const match = line.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z INFO "hello"$/);
  assert.ok(match, `expected default-formatted line, got: ${line}`);
  const timestamp = new Date(line.split(' ')[0]!).getTime();
  assert.ok(timestamp >= before && timestamp <= after);
});

test('buildTrace64LogLine escapes embedded double quotes in the message', () => {
  const line = buildTrace64LogLine({ message: 'said "hi" there', timestamp: 1 });
  assert.equal(line, '1970-01-01T00:00:00.001Z INFO "said \\"hi\\" there"');
});

test('buildTrace64LogLine appends structured fields as key=value pairs', () => {
  const line = buildTrace64LogLine({
    message: 'mitigation applied',
    timestamp: 42,
    fields: { scenario: 'oom-killed', attempt: 3, success: true, tags: null },
  });

  assert.equal(
    line,
    '1970-01-01T00:00:00.042Z INFO "mitigation applied" scenario="oom-killed" attempt=3 success=true tags=NULL',
  );
});

test('buildTrace64LogLine serializes object field values as JSON', () => {
  const line = buildTrace64LogLine({
    message: 'context',
    timestamp: 7,
    fields: { detail: { pod: 'api-1', restarts: 2 } },
  });

  assert.equal(line, '1970-01-01T00:00:00.007Z INFO "context" detail={"pod":"api-1","restarts":2}');
});

test('buildTrace64Script emits a basic TRACE32 LOG.OPEN / PRINT / LOG.CLOSE script', () => {
  const script = buildTrace64Script('/tmp/trace64.log', [
    { message: 'boot', timestamp: 1, level: 'info' },
    { message: 'ready', timestamp: 2, level: 'warn', fields: { pod: 'api-2' } },
  ]);

  assert.match(
    script,
    /^LOG\.OPEN "\/tmp\/trace64\.log"\nPRINT "1970-01-01T00:00:00\.001Z INFO \\"boot\\""\nPRINT "1970-01-01T00:00:00\.002Z WARN \\"ready\\" pod=\\"api-2\\""\nLOG\.CLOSE\n$/,
  );
});

test('writeTrace64Log is a no-op when Trace64 logging is disabled', () => {
  let called = false;
  writeTrace64Log(
    { message: 'should not be written' },
    { env: {}, write: () => { called = true; } },
  );

  assert.equal(called, false);
});

test('writeTrace64Log writes a rendered line through the sink when enabled', () => {
  const writtenLines: string[] = [];
  writeTrace64Log(
    { level: 'error', message: 'mitigation failed', timestamp: 99 },
    {
      env: { TRACE64_LOG_ENABLED: 'true' },
      write: (line) => { writtenLines.push(line); },
    },
  );

  assert.deepEqual(writtenLines, ['1970-01-01T00:00:00.099Z ERROR "mitigation failed"']);
});

test('writeTrace64Log passes the resolved env through to the sink', () => {
  let seenEnv: NodeJS.ProcessEnv | undefined;
  writeTrace64Log(
    { message: 'context propagation' },
    {
      env: { TRACE64_LOG_ENABLED: 'true', TRACE64_LOG_FILE: '/tmp/trace64.log' },
      write: (_line, options) => { seenEnv = options.env; },
    },
  );

  assert.equal(seenEnv?.['TRACE64_LOG_FILE'], '/tmp/trace64.log');
});

test('writeTrace64Log can invoke a trace64 executable when configured', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace64-logger-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const logFile = path.join(tempDir, 'trace64.log');
  const scriptFile = path.join(tempDir, 'trace64.cmm');
  let invokedCommand = '';
  let invokedArgs: string[] = [];
  writeTrace64Log(
    { level: 'info', message: 'trace64 commanded', timestamp: 500 },
    {
      env: {
        TRACE64_LOG_ENABLED: 'true',
        TRACE64_EXE: 'C:/Trace32/trace32.exe',
        TRACE64_LOG_FILE: logFile,
        TRACE64_SCRIPT_FILE: scriptFile,
      },
      spawnCommand: (command, args) => {
        invokedCommand = command;
        invokedArgs = args;
      },
    },
  );

  assert.equal(invokedCommand, 'C:/Trace32/trace32.exe');
  assert.deepEqual(invokedArgs, ['-s', scriptFile]);
  assert.match(fs.readFileSync(scriptFile, 'utf8'), /^LOG\.OPEN /);
});
