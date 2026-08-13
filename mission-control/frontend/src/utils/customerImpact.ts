import type { CustomerImpactStatus } from '@/types/api';

export function customerImpactStatusLabel(status: CustomerImpactStatus): string {
  switch (status) {
    case 'healthy': return 'Healthy';
    case 'degraded': return 'Degraded';
    case 'critical': return 'Critical';
    case 'unknown': return 'Unknown — telemetry unavailable';
    case 'no-data': return 'No telemetry data';
  }
}

export function customerImpactStatusIcon(status: CustomerImpactStatus): string {
  switch (status) {
    case 'healthy': return '●';
    case 'degraded': return '▲';
    case 'critical': return '!';
    case 'unknown': return '?';
    case 'no-data': return '○';
  }
}

export function customerImpactStatusClass(status: CustomerImpactStatus): string {
  return `customer-impact--${status}`;
}

export function formatFreshness(ageSeconds: number | undefined): string | undefined {
  if (ageSeconds === undefined) return undefined;
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  return `${Math.floor(ageSeconds / 60)}m ago`;
}
