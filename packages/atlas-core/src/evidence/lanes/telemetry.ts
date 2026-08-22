import type { EvidenceItem } from '../trace-dynamic-context.types.js';

export interface TelemetryEvidence {
  traceId: string;
  toolName: string;
  status: 'PROVEN' | 'PARTIAL_PROVEN' | 'NOT_PROVEN' | 'CONTRADICTED';
  note?: string;
}

export function telemetryEvidenceToItem(input: TelemetryEvidence): EvidenceItem {
  return {
    kind: 'telemetry_event',
    lane: 'telemetry',
    status: input.status,
    source: input.toolName,
    message: input.note,
    score: input.status === 'PROVEN' ? 1 : 0.5,
  };
}
