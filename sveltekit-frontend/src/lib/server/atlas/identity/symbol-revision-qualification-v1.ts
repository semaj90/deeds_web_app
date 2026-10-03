/**
 * SymbolRevisionQualificationV1 (S01-10B) — forward gate for canonical symbol revision writes.
 * Two explicit concepts (no generic isValidRevision boolean):
 *   - LogicalSymbolRegistryAdmissionV1   : may this nomination create/refresh a canonical atlas_symbol_registry row?
 *   - SymbolVersionRevisionQualificationV1: may this nomination create an atlas_symbol_versions row?
 * atlas_symbol_registry.created_from_source_revision / created_from_source_ref / registry_revision are NOT NULL, so a skeleton
 * without an authoritative revision is NOT representable: it fails closed. No NULL, no sentinel, no `workspace:0`, no Git sha, no "unknown".
 *
 * Qualification = canonical SHAPE (`sha256:<64 lowercase hex>`) AND PROVENANCE: an atlas_workspace_source_bindings row proving that
 * exact source_ref carries that exact source_revision, and that source_revision === `sha256:<content_digest>` of that binding.
 * Forbidden (never performed): workspace:N -> current revision, 40hex -> sha256:40hex or sha256(40hex), HEAD/latest substitution.
 * workspace_revision shape is checked here; that it is the ADMITTED workspace is proven by provenance (binding.workspaceRevision equality)
 * and by the S01-07 cohort, not by this pure function.
 */
import { REVISION_RE } from './symbol-identity-audit-v1';

export const SYMBOL_REVISION_QUALIFICATION_SCHEMA = 'atlas.symbol-revision-qualification.v1';

export type RevisionRejectionReasonV1 =
  | 'WORKSPACE_REVISION_PLACEHOLDER' | 'WORKSPACE_REVISION_INVALID'
  | 'SOURCE_REVISION_MISSING' | 'SOURCE_REVISION_GIT_COMMIT' | 'SOURCE_REVISION_LEGACY_40HEX' | 'SOURCE_REVISION_INVALID'
  | 'REVISION_PROVENANCE_MISSING' | 'REGISTRY_SCHEMA_REQUIRES_PLACEHOLDER';

/** One atlas_workspace_source_bindings row: proof that sourceRef carries sourceRevision (= sha256:contentDigest) inside workspaceRevision. */
export interface BindingProvenanceV1 { sourceRef: string; sourceRevision: string; workspaceRevision: string; contentDigest: string }

export interface AdmissionVerdictV1 { admitted: boolean; reasons: RevisionRejectionReasonV1[] }

const isBlank = (v: string | null | undefined): v is null | undefined | '' => v === null || v === undefined || v.trim() === '';

export function sourceRevisionReasonV1(v: string | null | undefined): RevisionRejectionReasonV1 | null {
  if (isBlank(v)) return 'SOURCE_REVISION_MISSING';
  if (REVISION_RE.test(v)) return null;
  if (/^[0-9a-f]{40}$/.test(v)) return 'SOURCE_REVISION_GIT_COMMIT';
  if (/^sha256:[0-9a-f]{40}$/.test(v)) return 'SOURCE_REVISION_LEGACY_40HEX';
  return 'SOURCE_REVISION_INVALID';
}

export function workspaceRevisionReasonV1(v: string | null | undefined): RevisionRejectionReasonV1 | null {
  if (isBlank(v)) return 'WORKSPACE_REVISION_INVALID';
  if (REVISION_RE.test(v)) return null;
  if (/^workspace(:\d*)?$/.test(v)) return 'WORKSPACE_REVISION_PLACEHOLDER';
  return 'WORKSPACE_REVISION_INVALID';
}

function provenanceHolds(sourceRef: string, sourceRevision: string, workspaceRevision: string | null, candidates: readonly BindingProvenanceV1[]): boolean {
  return candidates.some((b) => b.sourceRef === sourceRef && b.sourceRevision === sourceRevision && /^[0-9a-f]{64}$/.test(b.contentDigest)
    && sourceRevision === `sha256:${b.contentDigest}` && (workspaceRevision === null || b.workspaceRevision === workspaceRevision));
}

export interface LogicalSymbolRegistryAdmissionInputV1 { sourceRef: string | null; createdFromSourceRevision: string | null; registryRevision: string | null; provenance: readonly BindingProvenanceV1[] }

export function admitLogicalSymbolRegistryV1(i: LogicalSymbolRegistryAdmissionInputV1): AdmissionVerdictV1 {
  const reasons: RevisionRejectionReasonV1[] = [];
  const shape = sourceRevisionReasonV1(i.createdFromSourceRevision);
  if (shape) reasons.push(shape);
  if (shape === 'SOURCE_REVISION_MISSING' || isBlank(i.registryRevision) || isBlank(i.sourceRef)) reasons.push('REGISTRY_SCHEMA_REQUIRES_PLACEHOLDER');
  if (!shape && !isBlank(i.sourceRef) && !provenanceHolds(i.sourceRef, i.createdFromSourceRevision as string, null, i.provenance)) reasons.push('REVISION_PROVENANCE_MISSING');
  return { admitted: reasons.length === 0, reasons };
}

export interface SymbolVersionRevisionQualificationInputV1 { sourceRef: string | null; sourceRevision: string | null; workspaceRevision: string | null; provenance: readonly BindingProvenanceV1[] }

export function qualifySymbolVersionRevisionsV1(i: SymbolVersionRevisionQualificationInputV1): AdmissionVerdictV1 {
  const reasons: RevisionRejectionReasonV1[] = [];
  const src = sourceRevisionReasonV1(i.sourceRevision);
  const ws = workspaceRevisionReasonV1(i.workspaceRevision);
  if (src) reasons.push(src);
  if (ws) reasons.push(ws);
  if (!src && !ws && (isBlank(i.sourceRef) || !provenanceHolds(i.sourceRef, i.sourceRevision as string, i.workspaceRevision as string, i.provenance))) reasons.push('REVISION_PROVENANCE_MISSING');
  return { admitted: reasons.length === 0, reasons };
}

/** Nomination-shaped input for the package promoteNomination path, which writes registry + aliases + version in ONE transaction: both admissions must hold. */
export interface PromotionNominationV1 { source_ref?: string | null; source_revision?: string | null; workspace_revision?: string | null }
export function qualifyPromotionNominationV1(n: PromotionNominationV1, registryRevision: string | null, provenance: readonly BindingProvenanceV1[]): AdmissionVerdictV1 {
  const reg = admitLogicalSymbolRegistryV1({ sourceRef: n.source_ref ?? null, createdFromSourceRevision: n.source_revision ?? null, registryRevision, provenance });
  const ver = qualifySymbolVersionRevisionsV1({ sourceRef: n.source_ref ?? null, sourceRevision: n.source_revision ?? null, workspaceRevision: n.workspace_revision ?? null, provenance });
  const reasons = [...new Set([...reg.reasons, ...ver.reasons])];
  return { admitted: reasons.length === 0, reasons };
}

export class SymbolRevisionRejectedError extends Error {
  readonly reasons: RevisionRejectionReasonV1[];
  constructor(reasons: RevisionRejectionReasonV1[]) { super(`SYMBOL_REVISION_REJECTED ${reasons.join(',')}`); this.reasons = reasons; }
}

/** Run `mutate` ONLY when admitted. A rejection never invokes the callback (non-mutating by construction). */
export async function guardedSymbolMutationV1<T>(verdict: AdmissionVerdictV1, mutate: () => Promise<T>): Promise<{ mutated: true; result: T } | { mutated: false; reasons: RevisionRejectionReasonV1[] }> {
  if (!verdict.admitted) return { mutated: false, reasons: verdict.reasons };
  return { mutated: true, result: await mutate() };
}

export const bindingKeyV1 = (sourceRef: string, sourceRevision: string) => `${sourceRef}\u0000${sourceRevision}`;

/** Read-only provenance lookup (SELECT only). Returns candidates keyed by (source_ref, source_revision). */
export async function loadBindingProvenanceV1(db: { query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> }, pairs: ReadonlyArray<{ sourceRef: string | null | undefined; sourceRevision: string | null | undefined }>): Promise<Map<string, BindingProvenanceV1[]>> {
  const usable = pairs.filter((p): p is { sourceRef: string; sourceRevision: string } => !isBlank(p.sourceRef) && !isBlank(p.sourceRevision));
  const map = new Map<string, BindingProvenanceV1[]>();
  if (usable.length === 0) return map;
  const refs = [...new Set(usable.map((p) => p.sourceRef))];
  const revs = [...new Set(usable.map((p) => p.sourceRevision))];
  const res = await db.query(`SELECT canonical_source_ref, source_revision, workspace_revision, content_digest FROM atlas_workspace_source_bindings WHERE canonical_source_ref = ANY($1::text[]) AND source_revision = ANY($2::text[])`, [refs, revs]);
  for (const r of res.rows) {
    const k = bindingKeyV1(r.canonical_source_ref, r.source_revision);
    const list = map.get(k) ?? [];
    list.push({ sourceRef: r.canonical_source_ref, sourceRevision: r.source_revision, workspaceRevision: r.workspace_revision, contentDigest: r.content_digest });
    map.set(k, list);
  }
  return map;
}
export const provenanceForV1 = (map: Map<string, BindingProvenanceV1[]>, sourceRef: string | null | undefined, sourceRevision: string | null | undefined): BindingProvenanceV1[] =>
  isBlank(sourceRef) || isBlank(sourceRevision) ? [] : map.get(bindingKeyV1(sourceRef, sourceRevision)) ?? [];
