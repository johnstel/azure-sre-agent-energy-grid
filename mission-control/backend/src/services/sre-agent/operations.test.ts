import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_SRE_AGENT_TOOLS,
  BLOCKED_SRE_AGENT_TOOLS,
  SRE_AGENT_OPERATIONS,
  SreAgentOperationDeniedError,
  assertToolAllowed,
  buildToolFilterArgs,
  isReadOnlySreAgentOperation,
  resolveOperationTool,
} from './operations.js';
import { loadSreAgentConfig, buildChildEnv, isSreAgentUsable } from './config.js';
import { boundText, maskArmId, maskGuid, maskIdentifiers, redactForAudit, redactSegment, redactSensitiveText, RedactedStreamBuffer } from './redaction.js';

// --- investigate_yolo / auto-approval must be impossible ---------------------

test('investigate_yolo can never be resolved from a typed operation', () => {
  for (const operation of SRE_AGENT_OPERATIONS) {
    const tool = resolveOperationTool(operation);
    assert.ok(!/yolo/i.test(tool), `${operation} resolved to a yolo tool`);
  }

  const resolved = SRE_AGENT_OPERATIONS.map((operation) => resolveOperationTool(operation));
  assert.ok(!resolved.includes('sreagent_threads_investigate_yolo' as never));
});

test('assertToolAllowed rejects investigate_yolo and every auto-approval spelling', () => {
  const forbidden = [
    'sreagent_threads_investigate_yolo',
    'sreagent_threads_investigate_YOLO',
    'sreagent_threads_yolo',
    'sreagent_auto_approve',
    'sreagent_auto-approval',
    'sreagent_approve_all',
    'sreagent_bypass_approval',
    'sreagent_no_confirm',
  ];

  for (const tool of forbidden) {
    assert.throws(() => assertToolAllowed(tool), SreAgentOperationDeniedError, `${tool} was not blocked`);
  }
});

test('assertToolAllowed rejects destructive and configuration-mutating tools', () => {
  for (const tool of BLOCKED_SRE_AGENT_TOOLS) {
    assert.throws(() => assertToolAllowed(tool), SreAgentOperationDeniedError, `${tool} was not blocked`);
  }
});

test('assertToolAllowed rejects unknown, empty, and near-miss tool names', () => {
  for (const tool of ['', '   ', 'sreagent_threads_delete_all', 'azmcp_storage_account_list', 'sreagent']) {
    assert.throws(() => assertToolAllowed(tool), SreAgentOperationDeniedError);
  }
});

test('resolveOperationTool rejects unsupported operation names', () => {
  for (const operation of ['investigate-yolo', 'yolo', 'delete-thread', 'approve', '']) {
    assert.throws(() => resolveOperationTool(operation), SreAgentOperationDeniedError);
  }
});

test('the allowlist is exactly the six supported operations', () => {
  assert.equal(ALLOWED_SRE_AGENT_TOOLS.length, 6);
  assert.deepEqual([...ALLOWED_SRE_AGENT_TOOLS], [
    'sreagent_agents_get',
    'sreagent_agents_list',
    'sreagent_threads_create',
    'sreagent_threads_get',
    'sreagent_threads_investigate',
    'sreagent_threads_send_message',
  ]);
});

test('read-only operations never include investigation or follow-up', () => {
  assert.ok(isReadOnlySreAgentOperation('discover-agents'));
  assert.ok(isReadOnlySreAgentOperation('thread-status'));
  assert.ok(!isReadOnlySreAgentOperation('investigate'));
  assert.ok(!isReadOnlySreAgentOperation('follow-up'));
});

// --- server surface lockdown -------------------------------------------------

test('child MCP server argv restricts the server to the allowlisted tools', () => {
  const args = buildToolFilterArgs();
  assert.equal(args.filter((arg) => arg === '--tool').length, ALLOWED_SRE_AGENT_TOOLS.length);
  assert.ok(!args.some((arg) => /yolo/i.test(arg)));
  for (const tool of ALLOWED_SRE_AGENT_TOOLS) {
    assert.ok(args.includes(tool));
  }
});

test('the tool filter is appended even when an operator overrides the base argv', () => {
  const config = loadSreAgentConfig({
    SRE_AGENT_NAME: 'agent-x',
    SRE_AGENT_SUBSCRIPTION_ID: '11111111-2222-3333-4444-555555555555',
    SRE_AGENT_MCP_ARGS: '-y @azure/mcp@1.2.3 server start',
  });

  assert.ok(config.args.includes('--tool'));
  assert.ok(config.args.includes('sreagent_threads_investigate'));
  assert.ok(!config.args.some((arg) => /yolo/i.test(arg)));
  assert.equal(config.args.filter((arg) => arg === '--tool').length, 6);
});

test('an argv override cannot widen the child server tool surface', () => {
  const config = loadSreAgentConfig({
    SRE_AGENT_NAME: 'agent-x',
    SRE_AGENT_SUBSCRIPTION_ID: '11111111-2222-3333-4444-555555555555',
    SRE_AGENT_MCP_ARGS:
      '-y @azure/mcp@latest server start --tool sreagent_threads_investigate_yolo --namespace sreagent --mode all',
  });

  // The override is still usable, but the tool-widening flags are stripped.
  assert.equal(config.configured, true);
  assert.ok(!config.args.some((arg) => /yolo/i.test(arg)));
  assert.ok(!config.args.includes('--namespace'));
  assert.ok(!config.args.includes('--mode'));
  assert.ok(!config.args.includes('all'));
  assert.equal(config.args.filter((arg) => arg === '--tool').length, 6);
  assert.ok(config.configurationIssues.some((issue) => issue.includes('tool-exposure flags')));
});

// --- configuration -----------------------------------------------------------

test('configuration is unusable without an agent name and subscription', () => {
  const config = loadSreAgentConfig({});
  assert.equal(config.configured, false);
  assert.equal(isSreAgentUsable(config), false);
  assert.ok(config.configurationIssues.some((issue) => issue.includes('SRE_AGENT_NAME')));
  assert.ok(config.configurationIssues.some((issue) => issue.includes('SRE_AGENT_SUBSCRIPTION_ID')));
});

test('configuration rejects a malformed subscription GUID', () => {
  const config = loadSreAgentConfig({ SRE_AGENT_NAME: 'agent-x', SRE_AGENT_SUBSCRIPTION_ID: 'not-a-guid' });
  assert.equal(config.configured, false);
  assert.ok(config.configurationIssues.some((issue) => issue.includes('subscription GUID')));
});

test('configuration can be explicitly disabled', () => {
  const config = loadSreAgentConfig({
    SRE_AGENT_NAME: 'agent-x',
    SRE_AGENT_SUBSCRIPTION_ID: '11111111-2222-3333-4444-555555555555',
    SRE_AGENT_MCP_ENABLED: 'false',
  });
  assert.equal(config.configured, true);
  assert.equal(config.enabled, false);
  assert.equal(isSreAgentUsable(config), false);
});

test('configuration bounds timeouts, iterations, and output size', () => {
  const config = loadSreAgentConfig({
    SRE_AGENT_NAME: 'agent-x',
    SRE_AGENT_SUBSCRIPTION_ID: '11111111-2222-3333-4444-555555555555',
    SRE_AGENT_MAX_ITERATIONS: '9999',
    SRE_AGENT_REQUEST_TIMEOUT_MS: '1',
    SRE_AGENT_MAX_RESPONSE_CHARS: '999999999',
  });

  assert.equal(config.maxIterations, 20);
  assert.equal(config.requestTimeoutMs, 5_000);
  assert.equal(config.maxResponseChars, 100_000);
});

test('child environment carries no injected secrets and pins the configured target', () => {
  const config = loadSreAgentConfig({
    SRE_AGENT_NAME: 'agent-x',
    SRE_AGENT_SUBSCRIPTION_ID: '11111111-2222-3333-4444-555555555555',
    SRE_AGENT_TENANT_ID: '99999999-8888-7777-6666-555555555555',
  });

  const childEnv = buildChildEnv(config, { PATH: '/usr/bin' });
  assert.equal(childEnv['AZURE_SUBSCRIPTION_ID'], '11111111-2222-3333-4444-555555555555');
  assert.equal(childEnv['AZURE_TENANT_ID'], '99999999-8888-7777-6666-555555555555');
  assert.equal(childEnv['AZURE_CLIENT_SECRET'], undefined);
  assert.equal(childEnv['PATH'], '/usr/bin');
});

// --- redaction and bounding --------------------------------------------------

test('redaction strips bearer tokens, JWTs, keys, and connection-string secrets', () => {
  const input = [
    'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    'password=hunter2seekrit',
    'client_secret: abc123def456ghi',
    'AccountKey=Zm9vYmFyYmF6cXV4',
    'api-key = 9f8e7d6c5b4a3210',
  ].join('\n');

  const output = redactSensitiveText(input);
  assert.ok(!output.includes('hunter2seekrit'));
  assert.ok(!output.includes('abc123def456ghi'));
  assert.ok(!output.includes('Zm9vYmFyYmF6cXV4'));
  assert.ok(!output.includes('9f8e7d6c5b4a3210'));
  assert.ok(!/eyJhbGciOiJIUzI1NiJ9\.[A-Za-z0-9_-]+\./.test(output));
  assert.ok(output.includes('[REDACTED]'));
});

test('redaction removes PEM private keys entirely', () => {
  const output = redactSensitiveText('-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\n-----END RSA PRIVATE KEY-----');
  assert.equal(output, '[REDACTED-PRIVATE-KEY]');
});

test('redaction removes an unterminated PEM block so truncated key material cannot leak', () => {
  const output = redactSensitiveText('leading text -----BEGIN EC PRIVATE KEY-----\nMIIEsecretKeyMaterialHere');
  assert.ok(!output.includes('MIIEsecretKeyMaterialHere'));
  assert.ok(output.includes('[REDACTED-PRIVATE-KEY]'));
  assert.ok(output.startsWith('leading text '));
});

test('bounded output truncates explicitly instead of silently', () => {
  const bounded = boundText('x'.repeat(500), 100);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.originalLength, 500);
  assert.ok(bounded.text.includes('Mission Control truncated this response'));

  const short = boundText('all good', 100);
  assert.equal(short.truncated, false);
  assert.equal(short.text, 'all good');
});

test('GUIDs and ARM IDs are masked for display and evidence packs', () => {
  assert.equal(maskGuid('11111111-2222-3333-4444-555555555555'), '11111111-****-****-****-555555');
  assert.equal(maskGuid('nope'), '[redacted]');
  assert.equal(maskGuid(undefined), undefined);

  const masked = maskArmId(
    '/subscriptions/11111111-2222-3333-4444-555555555555/resourceGroups/rg-srelab/providers/Microsoft.App/agents/agent-x',
  );
  assert.ok(!masked?.includes('11111111-2222-3333-4444-555555555555'));
  assert.ok(masked?.includes('rg-srelab'));
  assert.ok(masked?.includes('agents/agent-x'));
});

test('audit redaction masks sensitive keys and bounds depth and size', () => {
  const audited = redactForAudit({
    message: 'investigate meter-service',
    access_token: 'super-secret-value',
    nested: { authorization: 'Bearer abc', keep: 'visible' },
    long: 'y'.repeat(900),
  }) as Record<string, any>;

  assert.equal(audited['access_token'], '[REDACTED]');
  assert.equal(audited['nested']['authorization'], '[REDACTED]');
  assert.equal(audited['nested']['keep'], 'visible');
  assert.ok(String(audited['long']).endsWith('…[truncated]'));
  assert.equal(audited['message'], 'investigate meter-service');
});

test('audit redaction masks subscription and tenant identifiers', () => {
  // Mission Control streams backend logs to an on-screen terminal during demos, so
  // these identifiers must never appear unmasked in an audit record.
  const audited = redactForAudit({
    agent: 'sre-agent-energygrid',
    subscription: '11111111-2222-3333-4444-555555555555',
    tenant: '99999999-8888-7777-6666-555555555555',
    'resource-group': 'rg-srelab-eastus2',
  }) as Record<string, any>;

  assert.equal(audited['subscription'], '11111111-****-****-****-555555');
  assert.equal(audited['tenant'], '99999999-****-****-****-555555');
  assert.equal(audited['agent'], 'sre-agent-energygrid');
  assert.equal(audited['resource-group'], 'rg-srelab-eastus2');
  assert.ok(!JSON.stringify(audited).includes('11111111-2222-3333-4444-555555555555'));
});

test('identifier masking removes subscription and tenant GUIDs from agent prose', () => {
  const known = {
    subscriptionId: '11111111-2222-3333-4444-555555555555',
    tenantId: '99999999-8888-7777-6666-555555555555',
  };

  const text = [
    'Root cause on /subscriptions/11111111-2222-3333-4444-555555555555/resourceGroups/rg-srelab/providers/Microsoft.ContainerService/managedClusters/aks-demo',
    'subscription id: 11111111-2222-3333-4444-555555555555',
    'tenantId=99999999-8888-7777-6666-555555555555',
    'bare reference 11111111-2222-3333-4444-555555555555 in prose',
  ].join('\n');

  const masked = maskIdentifiers(text, known);

  assert.ok(!masked.includes('11111111-2222-3333-4444-555555555555'), 'subscription GUID leaked');
  assert.ok(!masked.includes('99999999-8888-7777-6666-555555555555'), 'tenant GUID leaked');
  // Diagnostic context is preserved.
  assert.ok(masked.includes('rg-srelab'));
  assert.ok(masked.includes('managedClusters/aks-demo'));
  assert.ok(masked.includes('11111111-****-****-****-555555'));
});

test('identifier masking handles an unknown subscription in an ARM path', () => {
  const masked = maskIdentifiers('/subscriptions/abcdef12-3456-7890-abcd-ef1234567890/resourceGroups/rg');
  assert.ok(!masked.includes('abcdef12-3456-7890-abcd-ef1234567890'));
  assert.ok(masked.includes('/resourceGroups/rg'));
});

// --- streaming stderr redaction (regression: raw rolling-buffer secret leak) ---
//
// The previous implementation accumulated RAW stderr with `.slice(-2_000)` and redacted
// once on read. A PEM private key longer than the window had its BEGIN marker evicted
// while key body survived, so the final redaction pass had no marker to match and raw
// key material reached the error message and the UI.

/** Builds a PEM block whose body alone exceeds the 2,000-character retention window. */
function buildLongPem(bodyLines = 60): string {
  const body = Array.from(
    { length: bodyLines },
    (_, i) => `SECRETLINE${String(i).padStart(3, '0')}0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`,
  ).join('\n');
  return `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----\n`;
}

test('streaming stderr buffer keeps no key material when the BEGIN marker is evicted', () => {
  const pem = buildLongPem();
  assert.ok(pem.length > 2_000, 'the PEM must exceed the retention window for this regression');

  const buffer = new RedactedStreamBuffer();
  buffer.append(pem);
  // Enough ordinary diagnostics to push the marker out of a 2,000-char raw window.
  buffer.append('INFO: continuing startup diagnostics...\n'.repeat(80));

  const snapshot = buffer.snapshot();
  assert.ok(!snapshot.includes('SECRETLINE'), 'private key body reached the stderr hint');
  assert.ok(!snapshot.includes('-----BEGIN RSA PRIVATE KEY-----'));
  assert.ok(snapshot.includes('INFO: continuing startup diagnostics'), 'diagnostics should survive');
});

test('streaming stderr buffer drops key body split across many chunks', () => {
  const buffer = new RedactedStreamBuffer();
  // Marker and body arrive in separate writes, as a real pipe delivers them.
  buffer.append('-----BEGIN OPENSSH PRIVATE KEY-----\n');
  for (let i = 0; i < 60; i += 1) {
    buffer.append(`SECRETLINE${String(i).padStart(3, '0')}0123456789abcdefghijklmnopqrstuvwxyz\n`);
  }
  buffer.append('-----END OPENSSH PRIVATE KEY-----\n');
  buffer.append('npm warn deprecated something@1.0.0\n');

  const snapshot = buffer.snapshot();
  assert.ok(!snapshot.includes('SECRETLINE'), 'key body leaked across chunk boundaries');
  assert.ok(snapshot.includes('npm warn deprecated'));
});

test('streaming stderr buffer suppresses an unterminated key that is still streaming', () => {
  const buffer = new RedactedStreamBuffer();
  buffer.append('-----BEGIN EC PRIVATE KEY-----\n');
  buffer.append('SECRETLINE000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n'.repeat(50));

  const snapshot = buffer.snapshot();
  assert.ok(!snapshot.includes('SECRETLINE'));
  assert.ok(snapshot.includes('[REDACTED-PRIVATE-KEY]'));
});

test('streaming stderr buffer resumes normal output after the key ends', () => {
  const buffer = new RedactedStreamBuffer();
  buffer.append(buildLongPem(10));
  buffer.append('ERROR: agent endpoint unreachable\n');

  const snapshot = buffer.snapshot();
  assert.ok(!snapshot.includes('SECRETLINE'));
  assert.ok(snapshot.includes('ERROR: agent endpoint unreachable'));
});

test('streaming stderr buffer bounds a newline-free flood without splitting a marker', () => {
  const buffer = new RedactedStreamBuffer();
  // No newlines at all, then a marker arriving in two separate writes across the
  // forced-commit boundary.
  buffer.append('x'.repeat(9_000));
  buffer.append('-----BEGIN RSA PRI');
  buffer.append('VATE KEY-----SECRETBODYMATERIAL');

  const snapshot = buffer.snapshot();
  assert.ok(!snapshot.includes('SECRETBODYMATERIAL'), 'marker split across writes let body through');
  assert.ok(snapshot.length <= 2_000);
});

test('streaming stderr buffer still redacts ordinary single-line secrets', () => {
  const buffer = new RedactedStreamBuffer();
  buffer.append('config loaded password=hunter2seekrit\n');
  buffer.append('Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345\n');

  const snapshot = buffer.snapshot();
  assert.ok(!snapshot.includes('hunter2seekrit'));
  assert.ok(!snapshot.includes('abcdefghijklmnopqrstuvwxyz012345'));
  assert.ok(snapshot.includes('[REDACTED]'));
});

test('streaming stderr buffer redacts a secret split across a chunk boundary', () => {
  const buffer = new RedactedStreamBuffer();
  buffer.append('starting up password=hunt');
  buffer.append('er2seekrit trailing\n');

  const snapshot = buffer.snapshot();
  assert.ok(!snapshot.includes('hunter2seekrit'), 'secret straddling two chunks leaked');
});

test('streaming stderr buffer output stays bounded and resets between transports', () => {
  const buffer = new RedactedStreamBuffer();
  buffer.append('noise line that is reasonably long\n'.repeat(500));
  assert.ok(buffer.snapshot().length <= 2_000);

  buffer.reset();
  assert.equal(buffer.snapshot(), '');
});

test('redactSegment carries private-key state across segments', () => {
  const first = redactSegment('-----BEGIN RSA PRIVATE KEY-----\nSECRETLINE000\n', false);
  assert.equal(first.insideSecret, true);
  assert.ok(!first.text.includes('SECRETLINE'));

  const second = redactSegment('SECRETLINE001\nSECRETLINE002\n', first.insideSecret);
  assert.equal(second.insideSecret, true);
  assert.equal(second.text, '');

  const third = redactSegment('SECRETLINE003\n-----END RSA PRIVATE KEY-----\nready\n', second.insideSecret);
  assert.equal(third.insideSecret, false);
  assert.ok(!third.text.includes('SECRETLINE'));
  assert.ok(third.text.includes('ready'));
});
