/**
 * SymbolIdentityAuditV1 (S01-09) — PURE invariant checks over EXISTING symbol registry rows. Creates no identity and no id generator.
 * Chain under audit: stableFileId -> symbolId (stable logical symbol) -> symbolVersionId (revision-bound) -> treeNodeId (parse occurrence only).
 * Rejected as promotion authority: treeNodeId as symbol identity, a version without a qualified sourceRevision, fuzzy matching, "latest symbol" substitution.
 */
export type RevisionShape = 'QUALIFIED_SHA256' | 'PLACEHOLDER' | 'SHORT_OID' | 'MISSING' | 'OTHER';
export const REVISION_RE = /^sha256:[a-f0-9]{64}$/;
export function revisionShapeV1(v: string | null | undefined): RevisionShape {
  if (v === null || v === undefined || v === '') return 'MISSING';
  if (REVISION_RE.test(v)) return 'QUALIFIED_SHA256';
  if (/^workspace:\d+$/.test(v)) return 'PLACEHOLDER';
  if (/^[a-f0-9]{40}$/.test(v)) return 'SHORT_OID';
  return 'OTHER';
}

export interface SymbolVersionRowV1 { symbolVersionId: string; stableSymbolId: string; sourceRevision: string | null; workspaceRevision: string | null; upstreamNodeId: string | null; upstreamFileId: string | null; declarationHash: string | null; qualifiedName: string | null; sourceRef: string | null }
export interface RegistryRowV1 { stableSymbolId: string; createdFromSourceRevision: string | null; canonicalKey: string; status: string }

/** A version is admissible only when it carries a qualified sourceRevision AND workspaceRevision. */
export function versionAdmissibleV1(v: SymbolVersionRowV1): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (revisionShapeV1(v.sourceRevision) !== 'QUALIFIED_SHA256') reasons.push(`SOURCE_REVISION_${revisionShapeV1(v.sourceRevision)}`);
  if (revisionShapeV1(v.workspaceRevision) !== 'QUALIFIED_SHA256') reasons.push(`WORKSPACE_REVISION_${revisionShapeV1(v.workspaceRevision)}`);
  if (!v.upstreamNodeId) reasons.push('TREE_NODE_MISSING');
  if (!v.upstreamFileId) reasons.push('STABLE_FILE_LINK_ABSENT');
  return { ok: reasons.length === 0, reasons };
}

export function auditSymbolIdentityV1(input: { registry: readonly RegistryRowV1[]; versions: readonly SymbolVersionRowV1[]; aliasKinds: Record<string, number> }) {
  const { registry, versions } = input;
  const count = (f: (v: SymbolVersionRowV1) => boolean) => versions.filter(f).length;
  const shapes = (rows: Array<string | null>) => rows.reduce<Record<string, number>>((a, r) => { const k = revisionShapeV1(r); a[k] = (a[k] ?? 0) + 1; return a; }, {});
  const admissible = versions.filter((v) => versionAdmissibleV1(v).ok).length;
  // Revision qualification alone (separate from the stable-file link, which no version has because no stableFileId owner exists).
  const revisionQualified = versions.filter((v) => revisionShapeV1(v.sourceRevision) === 'QUALIFIED_SHA256' && revisionShapeV1(v.workspaceRevision) === 'QUALIFIED_SHA256').length;
  const revisionsPerSymbol = new Map<string, Set<string>>();
  for (const v of versions) revisionsPerSymbol.set(v.stableSymbolId, (revisionsPerSymbol.get(v.stableSymbolId) ?? new Set()).add(String(v.sourceRevision)));
  const multiRevisionSymbols = [...revisionsPerSymbol.values()].filter((s) => s.size > 1).length;
  const nodeToSymbols = new Map<string, Set<string>>();
  for (const v of versions) if (v.upstreamNodeId) nodeToSymbols.set(v.upstreamNodeId, (nodeToSymbols.get(v.upstreamNodeId) ?? new Set()).add(v.stableSymbolId));
  const nodesSharedAcrossSymbols = [...nodeToSymbols.values()].filter((s) => s.size > 1).length;
  const versioned = new Set(versions.map((v) => v.stableSymbolId));
  const embedsPath = (r: RegistryRowV1) => /^symbol:[a-z]+:[^:]*\/[^:]*:/.test(r.canonicalKey);
  const pathEmbeddedActive = registry.filter((r) => r.status === 'active' && embedsPath(r)).length;
  const pathEmbeddedRetired = registry.filter((r) => r.status !== 'active' && embedsPath(r)).length;
  const activeSymbols = registry.filter((r) => r.status === 'active').length;
  const moveAliases = (input.aliasKinds.move ?? 0) + (input.aliasKinds.rename ?? 0);
  return {
    registry: { symbols: registry.length, createdFromRevisionShapes: shapes(registry.map((r) => r.createdFromSourceRevision)), symbolsWithVersionRows: registry.filter((r) => versioned.has(r.stableSymbolId)).length, activeSymbols, activeKeysEmbeddingAFilePath: pathEmbeddedActive, retiredKeysEmbeddingAFilePath: pathEmbeddedRetired },
    versions: { rows: versions.length, sourceRevisionShapes: shapes(versions.map((v) => v.sourceRevision)), workspaceRevisionShapes: shapes(versions.map((v) => v.workspaceRevision)), admissible, notAdmissible: versions.length - admissible, revisionQualified, withStableFileLink: count((v) => !!v.upstreamFileId), treeNodesSharedAcrossStableSymbols: nodesSharedAcrossSymbols },
    predicates: {
      TREE_NODE_NOT_CANONICAL_SYMBOL_ID: { state: versions.every((v) => v.upstreamNodeId !== v.stableSymbolId) ? 'PROVEN' : 'VIOLATED' },
      VERSION_HAS_QUALIFIED_SOURCE_REVISION: { state: revisionQualified === versions.length && versions.length > 0 ? 'PROVEN' : 'VIOLATED', detail: `${versions.length - revisionQualified} of ${versions.length} versions lack a sha256-qualified source/workspace revision (${revisionQualified} qualify); fully admissible incl. the stable-file link: ${admissible}` },
      REGISTRY_CREATED_FROM_QUALIFIED_REVISION: { state: registry.every((r) => revisionShapeV1(r.createdFromSourceRevision) === 'QUALIFIED_SHA256') ? 'PROVEN' : 'VIOLATED' },
      STABLE_FILE_LINK: { state: count((v) => !!v.upstreamFileId) === versions.length && versions.length > 0 ? 'PROVEN' : 'BLOCKED_NO_STABLE_FILE_OWNER', detail: 'S01-08: no stableFileId owner exists' },
      SYMBOL_ID_PATH_INDEPENDENT: { state: pathEmbeddedActive > 0 ? 'VIOLATED' : activeSymbols === 0 ? 'BLOCKED_NO_EVIDENCE' : 'BLOCKED_NO_EVIDENCE', detail: `${pathEmbeddedActive} active keys embed a path; ${pathEmbeddedRetired} retired legacy keys do. Active keys are opaque hashes, but whether the hash input includes the path is not established from the key format, so path independence is not proven` },
      UNCHANGED_AND_CHANGED_SYMBOL_ACROSS_REVISIONS: { state: multiRevisionSymbols > 0 ? 'OBSERVED' : 'BLOCKED_NO_EVIDENCE', detail: `${multiRevisionSymbols} symbols observed at 2+ source revisions` },
      MOVE_AND_RENAME: { state: moveAliases > 0 ? 'OBSERVED' : 'BLOCKED_NO_EVIDENCE', detail: `move/rename aliases: ${moveAliases}; kinds present: ${JSON.stringify(input.aliasKinds)}` },
      TREE_NODE_OCCURRENCE_UNIQUE_TO_SYMBOL: { state: nodesSharedAcrossSymbols === 0 ? 'PROVEN' : 'VIOLATED', detail: `${nodesSharedAcrossSymbols} tree nodes are attached to more than one stable symbol` },
    },
    noFuzzyOrLatestSubstitutionInThisAudit: true as const,
  };
}
