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

type RequestLike = Pick<FastifyRequest, 'headers' | 'ip' | 'method' | 'socket' | 'url'>;

const principalClaimTypes = new Set([
  'http://schemas.microsoft.com/identity/claims/objectidentifier',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn',
  'oid',
  'sub',
  'nameid',
  'preferred_username',
]);

const groupClaimTypes = new Set([
  'groups',
  'roles',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
  'http://schemas.microsoft.com/identity/claims/groups',
]);

const nameClaimTypes = new Set([
  'name',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  'email',
  'preferred_username',
  'upn',
]);

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
          .split(/[\r\n,]+/)
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
    return parseStringArray([record.value, record.id, record.name, record.group, record.groups]);
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

  const normalized = value.replace(/^::ffff:/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
};

const isLoopbackRequest = (req: RequestLike): boolean => {
  const remoteAddress = req.socket?.remoteAddress ?? req.ip ?? '';
  return isLoopbackAddress(remoteAddress);
};

const findClaimValue = (claims: Array<Record<string, unknown>>, allowedTypes: Set<string>): string | undefined => {
  for (const claim of claims) {
    const typ = typeof claim.typ === 'string' ? claim.typ : '';
    const val = typeof claim.val === 'string' ? claim.val : typeof claim.value === 'string' ? claim.value : undefined;

    if (!val) {
      continue;
    }

    const normalizedType = typ.trim().toLowerCase();
    if (allowedTypes.has(normalizedType)) {
      return val.trim();
    }
  }

  return undefined;
};

const findGroupClaimValues = (claims: Array<Record<string, unknown>>): string[] => {
  const groups: string[] = [];

  for (const claim of claims) {
    const typ = typeof claim.typ === 'string' ? claim.typ : '';
    const val = typeof claim.val === 'string' ? claim.val : typeof claim.value === 'string' ? claim.value : undefined;

    if (!val) {
      continue;
    }

    if (groupClaimTypes.has(typ.trim().toLowerCase())) {
      groups.push(val.trim());
    }
  }

  return groups;
};

const parseRequestIdentity = (req: RequestLike): { principalId?: string; principalName?: string; groups: string[] } => {
  const principalHeader = coalesceHeader(req.headers['x-ms-client-principal']);
  if (!principalHeader) {
    return { groups: [] };
  }

  try {
    const decoded = Buffer.from(principalHeader, 'base64').toString('utf8');
    const payload = JSON.parse(decoded) as Record<string, unknown>;
    const claims = Array.isArray(payload.claims)
      ? payload.claims.filter((claim): claim is Record<string, unknown> => !!claim && typeof claim === 'object')
      : [];

    const principalId = findClaimValue(claims, principalClaimTypes);
    const principalName = findClaimValue(claims, nameClaimTypes);
    const decodedGroups = [
      ...findGroupClaimValues(claims),
      ...parseStringArray(payload.groups ?? []),
    ];

    return {
      principalId,
      principalName,
      groups: [...new Set(decodedGroups.map(entry => entry.trim()).filter(Boolean))],
    };
  } catch {
    return { groups: [] };
  }
};

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
  const method = (req.method ?? 'GET').toUpperCase();

  if (pathname === '/api/health' && (method === 'GET' || method === 'HEAD')) {
    return { allowed: true, reason: 'health' };
  }

  if (pathname === '/health') {
    return { allowed: false, reason: 'forbidden' };
  }

  const config = getMissionControlAuthConfig();

  if (!config.publicIngress) {
    return isLoopbackRequest(req)
      ? { allowed: true, reason: 'local-dev' }
      : { allowed: false, reason: 'forbidden' };
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
