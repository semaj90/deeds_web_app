/**
 * ValidationResultV1 — Immutability Gate Results (LOCKED)
 *
 * Records the result of cross-layer immutability checks (Phase 108D proof-matrix).
 * Used to track whether packet identity remains stable across all 5 storage layers:
 *
 * 1. PostgreSQL (canonical truth)
 * 2. Qdrant (vector mirror)
 * 3. Redis (cache)
 * 4. HyperRAG (RPC fact materialization)
 * 5. ACE (agent context assembler)
 *
 * VERSION: 1.0 (LOCKED)
 */

export type ProjectionLayer = 'POSTGRES' | 'QDRANT' | 'REDIS' | 'HYPERRAG_RPC' | 'ACE';

export type ViolationCode =
  | 'PACKET_KEY_MISSING'
  | 'PACKET_KEY_INVALID_PREFIX'
  | 'PACKET_KEY_MISMATCH'
  | 'SOURCE_REF_MISSING'
  | 'SOURCE_REF_MISMATCH'
  | 'FEATURE_ID_MISSING'
  | 'FEATURE_ID_MISMATCH'
  | 'WORKSPACE_ID_MISSING'
  | 'WORKSPACE_ID_MISMATCH'
  | 'ONTOLOGY_VERSION_MISSING'
  | 'CONTENT_HASH_MISSING'
  | 'CONTENT_HASH_MISMATCH'
  | 'COLLECTION_NAME_MISSING'
  | 'RPC_VERSION_MISSING'
  | 'JSON_PARSE_ERROR'
  | 'UNKNOWN';

export type ViolationSeverity = 'BLOCK' | 'WARN' | 'INFO';

export interface ValidationViolation {
  code: ViolationCode;
  layer: ProjectionLayer;
  severity: ViolationSeverity; // BLOCK = hard failure, WARN = mutable field, INFO = optional field
  path: string; // JSON path in the layer (e.g., "packet_key", "n_ary_facts")
  expected?: string; // what we expected
  actual?: string; // what we found
  message?: string; // human-readable explanation
}

export interface ProjectionSnapshot {
  layer: ProjectionLayer;
  packetKey: string | null;
  sourceRef: string | null;
  featureId: string | null;
  workspaceId: string | null;
  contentHash: string | null;
  workspaceRevision?: string | null;
  ontologyVersion?: string | null;
  snapshotAt: Date;
}

export interface ValidationResultV1 {
  // ── IDENTITY BEING VALIDATED ──────────────────────────────────
  packetKey: string; // the packet_key we're tracking
  workspaceId: string; // the workspace context

  // ── VALIDATION METADATA ───────────────────────────────────────
  validatedAt: Date; // when this validation ran
  validatedBy: string; // which component ran it (e.g., "phase-108d-proof-matrix", "bootstrap-validation")
  phase: string; // phase name (e.g., "108d-proof-matrix")

  // ── SNAPSHOTS FROM EACH LAYER ─────────────────────────────────
  projections: {
    postgres?: ProjectionSnapshot;
    qdrant?: ProjectionSnapshot;
    redis?: ProjectionSnapshot;
    hyperrag_rpc?: ProjectionSnapshot;
    ace?: ProjectionSnapshot;
  };

  // ── VIOLATION REPORT ──────────────────────────────────────────
  violations: ValidationViolation[];

  // ── GATE RESULT ───────────────────────────────────────────────
  isValid: boolean; // true only if NO BLOCK violations
  canPromotion: 'CROSS_STORE_PROVEN' | 'PARTIAL_PROVEN' | 'NOT_PROVEN'; // readiness for deployment

  // ── DETAILS ───────────────────────────────────────────────────
  blockedLayers?: ProjectionLayer[]; // layers with BLOCK violations
  warnLayers?: ProjectionLayer[]; // layers with WARN violations only
  passLayers?: ProjectionLayer[]; // layers with no violations

  // ── AUDIT TRAIL ───────────────────────────────────────────────
  previousValidationAt?: Date; // prior validation timestamp (for change tracking)
  changedFields?: string[]; // which fields changed since last validation
}

/**
 * Gate status levels (used across all Phase 108 work)
 *
 * PRESENT — file/function exists in codebase
 * STATICALLY_REFERENCED — found in static imports/exports
 * FIXTURE_PROVEN — works in unit tests with mock/fixture data
 * RUNTIME_SMOKE_PROVEN — works in smoke tests with real services
 * CROSS_STORE_PROVEN — immutability verified across all 5 layers (Phase 108D)
 */
export type GateStatus =
  | 'PRESENT'
  | 'STATICALLY_REFERENCED'
  | 'FIXTURE_PROVEN'
  | 'RUNTIME_SMOKE_PROVEN'
  | 'CROSS_STORE_PROVEN'
  | 'NOT_PROVEN';

/**
 * Create a validation result for a single packet.
 *
 * Use this factory when assembling proof-matrix results.
 */
export function createValidationResultV1(input: {
  packetKey: string;
  workspaceId: string;
  validatedBy: string;
  phase: string;
  projections: ValidationResultV1['projections'];
  violations: ValidationViolation[];
}): ValidationResultV1 {
  const blockedLayers = input.violations
    .filter((v) => v.severity === 'BLOCK')
    .map((v) => v.layer);

  const warnLayers = input.violations
    .filter((v) => v.severity === 'WARN')
    .map((v) => v.layer);

  const passLayers: ProjectionLayer[] = [];
  if (input.projections.postgres && !blockedLayers.includes('POSTGRES'))
    passLayers.push('POSTGRES');
  if (input.projections.qdrant && !blockedLayers.includes('QDRANT'))
    passLayers.push('QDRANT');
  if (input.projections.redis && !blockedLayers.includes('REDIS'))
    passLayers.push('REDIS');
  if (input.projections.hyperrag_rpc && !blockedLayers.includes('HYPERRAG_RPC'))
    passLayers.push('HYPERRAG_RPC');
  if (input.projections.ace && !blockedLayers.includes('ACE')) passLayers.push('ACE');

  const hasBlockViolations = input.violations.some((v) => v.severity === 'BLOCK');
  const isValid = !hasBlockViolations;

  // Determine canPromotion status
  let canPromotion: 'CROSS_STORE_PROVEN' | 'PARTIAL_PROVEN' | 'NOT_PROVEN' = 'NOT_PROVEN';
  if (isValid && passLayers.length === 5) {
    canPromotion = 'CROSS_STORE_PROVEN'; // All layers pass
  } else if (isValid && passLayers.length >= 3) {
    canPromotion = 'PARTIAL_PROVEN'; // Most layers pass
  }

  return {
    packetKey: input.packetKey,
    workspaceId: input.workspaceId,
    validatedAt: new Date(),
    validatedBy: input.validatedBy,
    phase: input.phase,
    projections: input.projections,
    violations: input.violations,
    isValid,
    canPromotion,
    blockedLayers: [...new Set(blockedLayers)],
    warnLayers: [...new Set(warnLayers)],
    passLayers,
  };
}

/**
 * Summarize validation results for logging/reporting.
 */
export function summarizeValidationResult(result: ValidationResultV1): string {
  const lines = [
    `Validation: ${result.packetKey}`,
    `Status: ${result.isValid ? 'PASS' : 'FAIL'}`,
    `Promotion: ${result.canPromotion}`,
    `Layers: PASS=${result.passLayers.length}/5, WARN=${result.warnLayers.length}, BLOCK=${result.blockedLayers.length}`,
  ];

  if (result.violations.length > 0) {
    lines.push(`Violations:`);
    result.violations.forEach((v) => {
      lines.push(`  [${v.severity}] ${v.layer}/${v.code}: ${v.message || v.path}`);
    });
  }

  return lines.join('\n');
}
