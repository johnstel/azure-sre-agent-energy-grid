export type RehearsalGateStatus = 'PASS_WITH_PENDING_HUMAN_PORTAL' | 'PASS' | 'REDACTION_BLOCKED';

export interface RehearsalEvidencePackageShape {
  complete: boolean;
  evidencePath?: string;
  manifestPath?: string;
  summaryPath?: string;
  redactionFindings: string[];
}

export function evaluateRehearsalGateStatus(evidencePackage: RehearsalEvidencePackageShape): RehearsalGateStatus {
  if (evidencePackage.redactionFindings.length > 0) {
    return 'REDACTION_BLOCKED';
  }
  if (evidencePackage.complete && evidencePackage.evidencePath && evidencePackage.manifestPath) {
    return 'PASS';
  }
  return 'PASS_WITH_PENDING_HUMAN_PORTAL';
}

export function formatPhaseLabel(phase: string): string {
  return phase.replace(/_/g, ' ');
}
