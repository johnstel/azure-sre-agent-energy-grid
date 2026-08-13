import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export type MissionControlAuthConfig = {
  publicIngress: boolean;
  authEnabled: boolean;
  allowedPrincipals: string[];
  allowedGroups: string[];
};

export type MissionControlAuthDecision = {
  allowed: boolean;
  reason: 'authorized' | 'local-dev' | 'health' | 'misconfigured' | 'missing-auth' | 'forbidden';
};

type RequestLike = Pick<FastifyRequest, 'headers' | 'hostname' | 'ip' | 'socket' | 'url'>;

const normalizeValue = (value: string | undefined): string => value?.trim().toLowerCase() ?? '';

const parseBoolean = (value: string | undefined): boolean => {
  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
};

const parseStringArray = (value: unknown): string[] => {
  if (typeof value === 'string') {
    if (value.startsWith('[')) {
      try {
        return parseStringArray(JSON.parse(value));
      } catch {
        return value
          .split(',')
          .map(entry => entry.trim())
          .filter(Boolean);
      }
    }

    return value
      .split(/[\r\n,]+/)
      .map(entry => entry.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap(entry => parseStringArray(entry));
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = [record.value, record.id, record.name, record.group, record.groups];
    return entries.flatMap(entry => parseStringArray(entry));
  }

  return [];
};

const coalesceHeader = (header: string | string[] | undefined): string | undefined => {
  if (Array.isArray(header)) {
    return header.find(entry => typeof entry === 'string' && entry.trim().length > 0);
  }

  return typeof header === 'string' && header.trim().length > 0 ? header.trim() : undefined;
};

const isLoopbackAddress = (value?: string): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.replace(/^::ffff:/, '').toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1' || normalized === '[::1]';
};

const isLoopbackRequest = (req: RequestLike): boolean => {
  const hostname = req.hostname ?? '';
  const remoteAddress = req.socket?.remoteAddress ?? req.ip ?? '';
  return isLoopbackAddress(hostname) || isLoopbackAddress(remoteAddress);
};

const parseRequestIdentity = (req: RequestLike): { principalId?: string; principalName?: string; groups: string[] } => {
  const principalHeader = coalesceHeader(req.headers['x-ms-client-principal']);
  const decodedPrincipal = principalHeader ? decodePrincipalHeader(principalHeader) : undefined;

  const principalId = coalesceHeader(req.headers['x-ms-client-principal-id']) ?? decodedPrincipal?.principalId;
  const principalName = coalesceHeader(req.headers['x-ms-client-principal-name']) ?? decodedPrincipal?.principalName;

  const groupHeader = coalesceHeader(req.headers['x-ms-client-principal-groups']) ?? coalesceHeader(req.headers['x-ms-client-principal-group']);
  const identityGroups = [
    ...parseStringArray(decodedPrincipal?.groups ?? []),
    ...parseStringArray(groupHeader ?? []),
  ];

  return {
    principalId,
    principalName,
    groups: [...new Set(identityGroups.map(entry => entry.trim()).filter(Boolean))],
  };
};

function decodePrincipalHeader(header: string): { principalId?: string; principalName?: string; groups: string[] } {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf8');
    const payload = JSON.parse(decoded) as Record<string, unknown>;

    const principalId = typeof payload.id === 'string'
      ? payload.id
      : typeof payload.userId === 'string'
        ? payload.userId
        : typeof payload.objectId === 'string'
          ? payload.objectId
          : typeof payload.sub === 'string'
            ? payload.sub
            : undefined;

    const principalName = typeof payload.name === 'string'
      ? payload.name
      : typeof payload.preferred_username === 'string'
        ? payload.preferred_username
        : typeof payload.email === 'string'
          ? payload.email
          : undefined;

    const groups = Array.isArray(payload.groups)
      ? payload.groups.flatMap(entry => parseStringArray(entry))
      : parseStringArray(payload.groups ?? []);

    return {
      principalId,
      principalName,
      groups,
    };
  } catch {
    return { groups: [] };
  }
}

export function getMissionControlAuthConfig(): MissionControlAuthConfig {
  const publicIngress = parseBoolean(process.env.MISSION_CONTROL_PUBLIC_INGRESS ?? process.env.MISSION_CONTROL_EXTERNAL_INGRESS);
  const authEnabled = parseBoolean(process.env.MISSION_CONTROL_AUTH_ENABLED ?? process.env.MISSION_CONTROL_AUTHENTICATION_ENABLED);

  const allowedPrincipals = parseStringArray(
    process.env.MISSION_CONTROL_ALLOWED_PRINCIPALS ??
      process.env.MISSION_CONTROL_ALLOWED_PRINCIPAL_IDS ??
      process.env.MISSION_CONTROL_ALLOWED_PRINCIPAL_ID,
  );

  const allowedGroups = parseStringArray(
    process.env.MISSION_CONTROL_ALLOWED_GROUPS ??
      process.env.MISSION_CONTROL_ALLOWED_GROUP_IDS ??
      process.env.MISSION_CONTROL_ALLOWED_GROUP_ID,
  );

  return {
    publicIngress,
    authEnabled,
    allowedPrincipals: [...new Set(allowedPrincipals.map(normalizeValue).filter(Boolean))],
    allowedGroups: [...new Set(allowedGroups.map(normalizeValue).filter(Boolean))],
  };
}

export function evaluateMissionControlAuthorization(req: RequestLike): MissionControlAuthDecision {
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (pathname === '/api/health' || pathname === '/health') {
    return { allowed: true, reason: 'health' };
  }

  if (isLoopbackRequest(req)) {
    return { allowed: true, reason: 'local-dev' };
  }

  const config = getMissionControlAuthConfig();
  if (!config.publicIngress) {
    return { allowed: true, reason: 'local-dev' };
  }

  if (!config.authEnabled || (config.allowedPrincipals.length === 0 && config.allowedGroups.length === 0)) {
    return { allowed: false, reason: 'misconfigured' };
  }

  const identity = parseRequestIdentity(req);
  if (!identity.principalId && identity.groups.length === 0) {
    return { allowed: false, reason: 'missing-auth' };
  }

  const principalSet = new Set(config.allowedPrincipals.map(normalizeValue));
  const groupSet = new Set(config.allowedGroups.map(normalizeValue));

  const allowedByPrincipal = identity.principalId ? principalSet.has(normalizeValue(identity.principalId)) : false;
  const allowedByGroup = identity.groups.some(group => groupSet.has(normalizeValue(group)));

  if (allowedByPrincipal || allowedByGroup) {
    return { allowed: true, reason: 'authorized' };
  }

  return { allowed: false, reason: 'forbidden' };
}

export function registerAuthAllowlistGuard(app: FastifyInstance): void {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const decision = evaluateMissionControlAuthorization(req as RequestLike);

    if (decision.allowed) {
      return;
    }

    if (decision.reason === 'misconfigured') {
      return reply.code(503).send({
        error: 'Mission Control public ingress is misconfigured; deny-by-default requires EasyAuth and an allowlist.',
      });
    }

    if (decision.reason === 'missing-auth') {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    return reply.code(403).send({ error: 'Forbidden' });
  });
}
