import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateMissionControlAuthorization } from './missionControlAuth.js';

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('MISSION_CONTROL_')) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnvironment);
});

describe('Mission Control auth fail-closed guard', () => {
  it('allows loopback local development without fabricated EasyAuth headers', () => {
    const decision = evaluateMissionControlAuthorization({
      url: '/api/deploy',
      headers: {},
      hostname: '127.0.0.1',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any,
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, 'local-dev');
  });

  it('allows a matching allowed principal in hosted/public mode', () => {
    process.env.MISSION_CONTROL_PUBLIC_INGRESS = 'true';
    process.env.MISSION_CONTROL_AUTH_ENABLED = 'true';
    process.env.MISSION_CONTROL_ALLOWED_PRINCIPALS = 'principal-123';

    const principalPayload = Buffer.from(JSON.stringify({ id: 'principal-123', groups: ['group-1'] })).toString('base64');
    const decision = evaluateMissionControlAuthorization({
      url: '/api/preflight',
      headers: {
        'x-ms-client-principal': principalPayload,
      },
      hostname: 'example.com',
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' } as any,
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, 'authorized');
  });

  it('denies hosted requests missing valid EasyAuth context', () => {
    process.env.MISSION_CONTROL_PUBLIC_INGRESS = 'true';
    process.env.MISSION_CONTROL_AUTH_ENABLED = 'true';
    process.env.MISSION_CONTROL_ALLOWED_PRINCIPALS = 'principal-123';

    const decision = evaluateMissionControlAuthorization({
      url: '/api/deploy',
      headers: {},
      hostname: 'example.com',
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' } as any,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'missing-auth');
  });

  it('denies public ingress when auth is disabled or the allowlist is empty', () => {
    process.env.MISSION_CONTROL_PUBLIC_INGRESS = 'true';
    process.env.MISSION_CONTROL_AUTH_ENABLED = 'false';
    process.env.MISSION_CONTROL_ALLOWED_PRINCIPALS = '';
    process.env.MISSION_CONTROL_ALLOWED_GROUPS = '';

    const decision = evaluateMissionControlAuthorization({
      url: '/api/destroy',
      headers: {},
      hostname: 'example.com',
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' } as any,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'misconfigured');
  });

  it('keeps the documented health endpoint public even with public ingress enabled', () => {
    process.env.MISSION_CONTROL_PUBLIC_INGRESS = 'true';
    process.env.MISSION_CONTROL_AUTH_ENABLED = 'false';

    const decision = evaluateMissionControlAuthorization({
      url: '/api/health',
      headers: {},
      hostname: 'example.com',
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' } as any,
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, 'health');
  });
});
