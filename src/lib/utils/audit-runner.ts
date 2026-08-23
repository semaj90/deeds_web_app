/**
 * Runnable entry point for the parity reconciliation pipeline.
 *
 * Consumes an AuditReport and produces typed ReconciliationEvents.
 * Does not execute repairs — callers decide what to apply.
 */

import type { AuditReport, AuditStatus } from '../types/canonical-records';
import type {
  ReconciliationEvent,
  FullProjectionEventPayload,
  SummaryVectorRepairEventPayload,
  PayloadRepairEventPayload,
  QuarantineEventPayload,
} from '../types/reconciliation-events';

// ── Event generators ──────────────────────────────────────────────────────────

function generateFullProjectionEvents(
  report: AuditReport,
  collection: string,
): FullProjectionEventPayload[] {
  return report.issues.missing.point_ids.map((qdrantPointId) => ({
    packet_id:          qdrantPointId,
    packet_key:         qdrantPointId,
    source_ref:         '',
    qdrant_point_id:    qdrantPointId,
    collection,
    missing_components: ['point'],
    reason:             'point absent in Qdrant',
  }));
}

function generateQuarantineEvents(
  report: AuditReport,
  collection: string,
): QuarantineEventPayload[] {
  return report.issues.contradictions.mismatches.map((m) => ({
    packet_id:         m.packet_key,
    packet_key:        m.packet_key,
    qdrant_point_id:   m.qdrant_point_id,
    collection,
    contradiction_type: 'identity_contradiction',
    reason:             m.reason,
  }));
}

// ── Reconciliation service ────────────────────────────────────────────────────

export interface ReconciliationResult {
  events:      ReconciliationEvent[];
  finalStatus: AuditStatus;
}

/**
 * Generate all repair and quarantine events for a given audit report.
 * Quarantine events are included in the result but must never be passed to
 * an apply function — callers must filter by event_type.
 */
export function generateRepairEvents(
  report: AuditReport,
  collection: string,
): ReconciliationResult {
  if (report.status === 'PASS') {
    return { events: [], finalStatus: 'PASS' };
  }

  const events: ReconciliationEvent[] = [];

  // Coverage debt → auto-repair eligible
  if (report.issues.missing.point_ids.length > 0) {
    events.push(...generateFullProjectionEvents(report, collection));
  }

  // Identity contradictions → quarantine only, never auto-repaired
  if (report.issues.contradictions.mismatches.length > 0) {
    events.push(...generateQuarantineEvents(report, collection));
  }

  return { events, finalStatus: report.status };
}

// ── AuditRunner ───────────────────────────────────────────────────────────────

export class AuditRunner {
  private readonly report:     AuditReport;
  private readonly collection: string;

  constructor(report: AuditReport, collection: string) {
    this.report     = report;
    this.collection = collection;
  }

  run(): ReconciliationResult {
    return generateRepairEvents(this.report, this.collection);
  }
}

/** Convenience wrapper for script callers. */
export function runFullAudit(
  report: AuditReport,
  collection: string,
): ReconciliationResult {
  return new AuditRunner(report, collection).run();
}
