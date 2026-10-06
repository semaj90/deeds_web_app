import { repairErrorFingerprintV1, type RepairEvidenceSnapshotV1 } from './repair-episode-verifier-v1.js';

/**
 * RepairEvidenceAdapterV1: PURE bridge from the existing `atlas.typescript-error-evidence.v1` report (capture-typescript-
 * error-evidence-v1 / typescript-error-evidence-v1.mjs) to the verifier's snapshot. It reads nothing and runs no checker.
 * Fails closed: missing revisions, truncated or partially-malformed evidence cannot prove that an error is gone, so they
 * are rejected, never coerced or defaulted.
 */
export interface TypeScriptErrorEvidenceReportV1 {
  schema: string;
  input?: { artifactChecksum?: string };
  lineage?: { workspaceRevision?: string | null; sourceRevision?: string | null };
  errors: Array<{
    sourceRef: string;
    code: string | null;
    message: string;
    severity: string; // parser emits 'error' | 'warning'; compared by value so the real parser output type-checks
    sourceRevision?: string | null;
    workspaceRevision?: string | null;
  }>;
  summary?: { truncated?: boolean; malformedLineCount?: number };
}

export interface RepairEvidenceSnapshotResultV1 {
  snapshot: RepairEvidenceSnapshotV1;
  artifactChecksum: string;
  errorCount: number;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function evidenceReportToSnapshotV1(report: TypeScriptErrorEvidenceReportV1, options: { includeWarnings?: boolean; allowMalformedLines?: boolean } = {}): RepairEvidenceSnapshotResultV1 {
  if (report.schema !== 'atlas.typescript-error-evidence.v1') throw new Error('REPAIR_EVIDENCE_SCHEMA_UNSUPPORTED');
  const workspaceRevision = report.lineage?.workspaceRevision;
  const sourceRevision = report.lineage?.sourceRevision;
  if (!nonEmpty(workspaceRevision)) throw new Error('REPAIR_EVIDENCE_WORKSPACE_REVISION_MISSING');
  if (!nonEmpty(sourceRevision)) throw new Error('REPAIR_EVIDENCE_SOURCE_REVISION_MISSING');
  if (report.summary?.truncated) throw new Error('REPAIR_EVIDENCE_TRUNCATED');
  if (!options.allowMalformedLines && (report.summary?.malformedLineCount ?? 0) > 0) throw new Error('REPAIR_EVIDENCE_HAS_MALFORMED_LINES');
  if (!nonEmpty(report.input?.artifactChecksum)) throw new Error('REPAIR_EVIDENCE_ARTIFACT_CHECKSUM_MISSING');
  for (const e of report.errors) {
    if (e.workspaceRevision !== workspaceRevision || e.sourceRevision !== sourceRevision) throw new Error('REPAIR_EVIDENCE_ERROR_REVISION_MISMATCH');
  }
  const kept = report.errors.filter((e) => options.includeWarnings || e.severity === 'error');
  return {
    snapshot: {
      workspaceRevision,
      sourceRevision,
      fingerprints: kept.map((e) => repairErrorFingerprintV1({ file: e.sourceRef, code: e.code ?? 'UNCODED', message: e.message })),
    },
    artifactChecksum: report.input.artifactChecksum,
    errorCount: kept.length,
  };
}

/** Distinct target fingerprints for one file (optionally one code) from the BEFORE report: the evidence-only TaskCandidate target. */
export function targetFingerprintsForFileV1(report: TypeScriptErrorEvidenceReportV1, sourceRef: string, code?: string): string[] {
  const want = sourceRef.replaceAll('\\', '/').replace(/^\.\//, '');
  const hits = report.errors.filter((e) => e.severity === 'error' && e.sourceRef === want && (code === undefined || (e.code ?? 'UNCODED') === code));
  return [...new Set(hits.map((e) => repairErrorFingerprintV1({ file: e.sourceRef, code: e.code ?? 'UNCODED', message: e.message })))].sort();
}
