import type { AssistantEscalationLink } from '@/types/api';

const GENERIC_SRE_AGENT_HANDOFF = 'https://sre.azure.com';

function isSafeHttpsUrl(value: string | undefined): value is string {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function configuredSreAgentHandoff(): AssistantEscalationLink {
  const configuredUrl = import.meta.env.VITE_AZURE_SRE_AGENT_PORTAL_URL;
  const href = isSafeHttpsUrl(configuredUrl) ? configuredUrl : GENERIC_SRE_AGENT_HANDOFF;

  return {
    label: href === GENERIC_SRE_AGENT_HANDOFF ? 'Open Azure SRE Agent portal' : 'Open configured Azure SRE Agent handoff',
    href,
    kind: 'sre-agent',
    description: 'Handoff only: Local Analyst has not invoked Azure SRE Agent. Use the portal for cloud-side diagnosis and remediation guidance.',
  };
}

export function visibleEscalationLinks(links: AssistantEscalationLink[] | undefined): AssistantEscalationLink[] {
  const configuredFallback = configuredSreAgentHandoff();
  const safeLinks = (links ?? [])
    .filter(link => isSafeHttpsUrl(link.href))
    .filter(link => link.kind !== 'sre-agent' || link.href !== GENERIC_SRE_AGENT_HANDOFF);

  return [...safeLinks, configuredFallback];
}
