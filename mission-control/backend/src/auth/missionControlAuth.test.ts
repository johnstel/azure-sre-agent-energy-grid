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
      method: 'GET',
      url: '/api/deploy',
      headers: {},
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

    const principalPayload = Buffer.from(JSON.stringify({
      claims: [
        { typ: 'http://schemas.microsoft.com/identity/claims/objectidentifier', val: 'principal-123' },
        { typ: 'groups', val: 'group-1' },
      ],
    })).toString('base64');

    const decision = evaluateMissionControlAuthorization({
      method: 'GET',
      url: '/api/preflight',
      headers: {
        'x-ms-client-principal': principalPayload,
      },
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' } as any,
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, 'authorized');
  });

  it('allows a matching allowed group in hosted/public mode', () => {
    process.env.MISSION_CONTROL_PUBLIC_INGRESS = 'true';
    process.env.MISSION_CONTROL_AUTH_ENABLED = 'true';
    process.env.MISSION_CONTROL_ALLOWED_GROUPS = 'group-42';

    const principalPayload = Buffer.from(JSON.stringify({
      claims: [
        { typ: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier', val: 'some-user' },
        { typ: 'groups', val: 'group-42' },
      ],
    })).toString('base64');

    const decision = evaluateMissionControlAuthorization({
      method: 'GET',
      url: '/api/pods',
      headers: {
        'x-ms-client-principal': principalPayload,
      },
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' } as any,
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, 'authorized');
  });

  it('rejects spoofed convenience headers even when the client supplies a principal id', () => {
    process.env.MISSION_CONTROL_PUBLIC_INGRESS = 'true';
    process.env.MISSION_CONTROL_AUTH_ENABLED = 'true';
    process.env.MISSION_CONTROL_ALLOWED_PRINCIPALS = 'principal-123';

    const decision = evaluateMissionControlAuthorization({
      method: 'GET',
      url: '/api/deploy',
      headers: {
        'x-ms-client-principal-id': 'spoofed-id',
      },
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' } as any,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'missing-auth');
  });

  it('rejects malformed or missing EasyAuth claims', () => {
    process.env.MISSION_CONTROL_PUBLIC_INGRESS = 'true';
    process.env.MISSION_CONTROL_AUTH_ENABLED = 'true';
    process.env.MISSION_CONTROL_ALLOWED_PRINCIPALS = 'principal-123';

    const decision = evaluateMissionControlAuthorization({
      method: 'GET',
      url: '/api/deploy',
      headers: {
        'x-ms-client-principal': Buffer.from('not-json').toString('base64'),
      },
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' } as any,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'missing-auth');
  });

  it('denies non-loopback requests when public ingress is disabled', () => {
    process.env.MISSION_CONTROL_PUBLIC_INGRESS = 'false';
    process.env.MISSION_CONTROL_AUTH_ENABLED = 'false';

    const decision = evaluateMissionControlAuthorization({
      method: 'GET',
      url: '/api/deploy',
      headers: {},
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' } as any,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'forbidden');
  });

  it('denies public ingress when auth is disabled or the allowlist is empty', () => {
    process.env.MISSION_CONTROL_PUBLIC_INGRESS = 'true';
    process.env.MISSION_CONTROL_AUTH_ENABLED = 'false';
    process.env.MISSION_CONTROL_ALLOWED_PRINCIPALS = '';
    process.env.MISSION_CONTROL_ALLOWED_GROUPS = '';

    const decision = evaluateMissionControlAuthorization({
      method: 'POST',
      url: '/api/destroy',
      headers: {},
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' } as any,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'misconfigured');
  });

  it('denies the non-authorized /health path even with public ingress enabled', () => {
    process.env.MISSION_CONTROL_PUBLIC_INGRESS = 'true';
    process.env.MISSION_CONTROL_AUTH_ENABLED = 'true';
    process.env.MISSION_CONTROL_ALLOWED_PRINCIPALS = 'principal-123';

    const decision = evaluateMissionControlAuthorization({
      method: 'GET',
      url: '/health',
      headers: {},
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' } as any,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'forbidden');
  });

  it('keeps the documented health endpoint public even with public ingress enabled', () => {
    process.env.MISSION_CONTROL_PUBLIC_INGRESS = 'true';
    process.env.MISSION_CONTROL_AUTH_ENABLED = 'false';

    const decision = evaluateMissionControlAuthorization({
      method: 'GET',
      url: '/api/health',
      headers: {},
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' } as any,
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, 'health');
  });
});
