/**
 * @file src/lib/server/atlas/ace-kag-dag-evidence-schema.ts
 * @description Canonical ACE/KAG/DAG evidence shape for all Parent Atlas indexing pipelines.
 *
 * Every indexing lane (concept-evidence, higher-hop, recommendation, GPU, cache) produces
 * this shape before mutation. Enables deterministic agent error-fixing hooks, replay, and audit.
 */

import { z } from 'zod';

/**
 * Canonical packet evidence reference — what evidence drove the packet decision
 */
export const PacketEvidenceSchema = z.object({
  packet_kind: z.enum([
    'env_contract',
    'concept_evidence',
    'higher_hop',
    'recommendation',
    'gpu_enrichment',
    'cache_metadata',
    'nes_chrom',
    'function_index'
  ]).describe('Packet category'),
  packet_key: z.string().describe('Unique packet identifier'),
  source_ref: z.string().describe('Source file or origin'),
  feature_id: z.string().describe('Feature classification'),
  evidence: z.array(z.string()).describe('Audit trail: which scripts/data drove this packet'),
  topology: z.object({
    community_id: z.string().nullable().optional().describe('Community classification'),
    concept_ids: z.array(z.string()).optional().describe('Related concepts'),
    supernode_pressure: z.number().optional().describe('Edge count pressure on graph')
  }).optional(),
  trace_count: z.number().optional().describe('How many traces support this packet'),
  packets_affected: z.number().optional().describe('Total packets in scope'),
  confidence: z.number().min(0).max(1).describe('0–1 confidence in this evidence'),
  timestamp: z.string().describe('ISO 8601 timestamp')
});

export type PacketEvidence = z.infer<typeof PacketEvidenceSchema>;

/**
 * Gate status for a single validation stage
 */
const GateStatusSchema = z.enum(['PASS', 'FAIL', 'PENDING', 'SKIPPED', 'DEFER']);

/**
 * Canonical ACE/KAG/DAG hit structure — what the gate harness produces
 */
export const AceKagDagHitSchema = z.object({
  ace_kag_dag_hit: PacketEvidenceSchema,
  gates: z.object({
    syntax: GateStatusSchema.describe('Node --check validation'),
    producer: GateStatusSchema.describe('Artifact generation'),
    artifact_valid: GateStatusSchema.describe('JSON parse validation'),
    consumer_dry_run: GateStatusSchema.describe('Dry-run execution'),
    ace_kag_dag_hit: GateStatusSchema.describe('This evidence shape validation'),
    smoke: GateStatusSchema.describe('Smoke test (schema + lineage)'),
    final_apply: GateStatusSchema.describe('Ready for --apply or DEFER reason')
  }).describe('Per-stage gate results'),
  defer_reason: z.string().optional().describe('If final_apply=DEFER, why'),
  error_log: z.array(z.object({
    gate: z.string(),
    message: z.string(),
    suggestion: z.string().optional()
  })).optional().describe('Gate failures with remediation suggestions'),
  apply_mode: z.enum(['dry-run', 'apply']).optional(),
  wall_clock_ms: z.number().optional().describe('Execution duration'),
  reports_written: z.array(z.string()).optional().describe('Output file paths')
});

export type AceKagDagHit = z.infer<typeof AceKagDagHitSchema>;

/**
 * Helper: Create an ACE/KAG/DAG hit with all gates initially PENDING
 */
export function createAceKagDagHit(
  packetKind: string,
  packetKey: string,
  sourceRef: string,
  featureId: string,
  evidence: string[]
): AceKagDagHit {
  return {
    ace_kag_dag_hit: {
      packet_kind: packetKind as any,
      packet_key: packetKey,
      source_ref: sourceRef,
      feature_id: featureId,
      evidence,
      confidence: 0,
      timestamp: new Date().toISOString()
    },
    gates: {
      syntax: 'PENDING',
      producer: 'PENDING',
      artifact_valid: 'PENDING',
      consumer_dry_run: 'PENDING',
      ace_kag_dag_hit: 'PENDING',
      smoke: 'PENDING',
      final_apply: 'PENDING'
    },
    error_log: []
  };
}

/**
 * Helper: Record a gate result
 */
export function recordGate(
  hit: AceKagDagHit,
  gateName: keyof AceKagDagHit['gates'],
  status: 'PASS' | 'FAIL' | 'SKIP' | 'DEFER',
  message?: string,
  suggestion?: string
): void {
  hit.gates[gateName] = status as any;
  if (status === 'FAIL' && message) {
    hit.error_log?.push({ gate: gateName, message, suggestion });
  }
}

/**
 * Helper: Determine if all gates PASS → safe to apply
 */
export function canApply(hit: AceKagDagHit): boolean {
  const gateEntries = Object.entries(hit.gates);
  return gateEntries.every(([_, status]) => status === 'PASS');
}

/**
 * Helper: Validate ACE/KAG/DAG hit structure before mutation
 */
export function validateAceKagDagHit(input: unknown): { valid: boolean; error?: string } {
  try {
    AceKagDagHitSchema.parse(input);
    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}
