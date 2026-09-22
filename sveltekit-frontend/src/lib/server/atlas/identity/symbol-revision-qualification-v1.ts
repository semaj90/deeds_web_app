/**
 * SymbolRevisionQualificationV1 (S01-10B) — forward gate for revision-BEARING symbol writes.
 * Reuses revisionShapeV1 (symbol-identity-audit-v1) as the single shape owner; adds no identity, no generator, no fallback.
 * A value is qualified only when it is `sha256:<64 lowercase hex>`. `workspace:N`, a 40-hex Git id, empty, or absent are rejected;
 * they are never converted (no `sha256:` prefixing, hashing, HEAD/latest substitution).
 * Scope: rows that CARRY a revision (versions; registry rows that state created_from_source_revision). Revision-less logical
 * skeletons are a schema-contract question (NOT NULL columns) and are out of scope here.
 */
import { revisionShapeV1, type RevisionShape } from './symbol-identity-audit-v1';

export const SYMBOL_REVISION_QUALIFICATION_SCHEMA = 'atlas.symbol-revision-qualification.v1';

export type SymbolWriteTargetV1 = 'atlas_symbol_registry' | 'atlas_symbol_versions';
export interface SymbolRevisionFieldV1 { field: string; value: string | null | undefined }
export interface SymbolRevisionVerdictV1 { ok: boolean; target: SymbolWriteTargetV1; violations: Array<{ field: string; shape: RevisionShape; code: string }> }

export function qualifySymbolRevisionsV1(target: SymbolWriteTargetV1, fields: readonly SymbolRevisionFieldV1[]): SymbolRevisionVerdictV1 {
  const violations = fields.flatMap(({ field, value }) => {
    const shape = revisionShapeV1(value);
    return shape === 'QUALIFIED_SHA256' ? [] : [{ field, shape, code: `${field.toUpperCase()}_${shape}` }];
  });
  return { ok: violations.length === 0, target, violations };
}

export class SymbolRevisionRejectedError extends Error {
  readonly verdict: SymbolRevisionVerdictV1;
  constructor(verdict: SymbolRevisionVerdictV1) {
    super(`SYMBOL_REVISION_REJECTED ${verdict.target}: ${verdict.violations.map((v) => v.code).join(',')}`);
    this.verdict = verdict;
  }
}

export function assertQualifiedSymbolRevisionsV1(target: SymbolWriteTargetV1, fields: readonly SymbolRevisionFieldV1[]): void {
  const verdict = qualifySymbolRevisionsV1(target, fields);
  if (!verdict.ok) throw new SymbolRevisionRejectedError(verdict);
}
