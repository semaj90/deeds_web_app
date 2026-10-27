import { parseImportStatement, resolveSpecifier, listExports } from './import-specifier-resolution-v1.mjs';
import { followExport } from './export-follower-v1.mjs';

/**
 * ImportResolutionV1 (pure, proposal-only). One record per import binding, built from sidecar IMPORTS edges.
 * The sidecar emits two edges per statement (the statement and its binding clause); they are merged into ONE observation and both
 * evidence refs are kept. MODULE_RESOLVED and SYMBOL_VERSION_VERIFIED stay separate: the latter needs a followed export, an exact
 * (source_ref, source_revision) match to the current admitted manifest, and exactly one stable symbol id.
 *
 * Symbol-version equivalence rule (reviewer-approved as a PROPOSAL, 6.M23): a row is usable evidence for the current snapshot when its
 * source_ref maps to the manifest path by an explicit prefix rule AND its source_revision equals the admitted code_source_revision.
 * Its workspace_revision is carried through untouched as `symbolVersionWorkspaceRevision` and is never reinterpreted.
 */
export const IMPORT_RESOLUTIONS = Object.freeze(['MODULE_RESOLVED', 'SYMBOL_VERSION_VERIFIED', 'EXTERNAL_MODULE', 'AMBIGUOUS', 'UNRESOLVED']);
const SHA = /^sha256:[0-9a-f]{64}$/;
const normRev = (r) => (typeof r === 'string' && !r.startsWith('sha256:') && /^[0-9a-f]{64}$/.test(r) ? `sha256:${r}` : r);

export function mergeImportEdges(edges) {
  const statements = []; const clauses = [];
  for (const e of edges) {
    if (e.type !== 'IMPORTS') continue;
    (/^\s*import\b/.test(String(e.to_evidence_key)) ? statements : clauses).push(e);
  }
  const rangeKey = (e) => `${e.evidence_start_line}:${e.evidence_start_column}-${e.evidence_end_line}:${e.evidence_end_column}`;
  const byRange = new Map();
  for (const s of statements) byRange.set(rangeKey(s), { statement: s, clauseEdges: [] });
  const orphanClauses = [];
  for (const c of clauses) { const hit = byRange.get(rangeKey(c)); if (hit) hit.clauseEdges.push(c); else orphanClauses.push(c); }
  return { observations: [...byRange.values()], orphanClauses };
}

/** @param {{importerRel:string, importerRevision:string, edges:object[], manifest:Map<string,string>, aliases:object[], readSource:(rel:string)=>string|null, symbolVersions:(rel:string)=>Array<{qualified_name:string,stable_symbol_id:string,symbol_version_id?:string,source_revision:string,workspace_revision:string}>, pathPrefixRule?:(rel:string)=>string[] }} input */
export function resolveImports({ importerRel, importerRevision, edges, manifest, aliases = [], readSource, symbolVersions, pathPrefixRule }) {
  const { observations, orphanClauses } = mergeImportEdges(edges);
  const records = []; const rejected = [];
  if (!SHA.test(importerRevision ?? '')) return { records, rejected: [{ reason: 'IMPORTER_REVISION_NOT_SHA256' }], orphanClauses: orphanClauses.length };
  if (!manifest.has(importerRel) || normRev(manifest.get(importerRel)) !== importerRevision) return { records, rejected: [{ reason: 'IMPORTER_REVISION_NOT_ADMITTED' }], orphanClauses: orphanClauses.length };

  for (const { statement, clauseEdges } of observations) {
    const parsed = parseImportStatement(statement.to_evidence_key);
    const evidenceRefs = [statement, ...clauseEdges].map((e) => `${importerRel}#L${e.evidence_start_line}C${e.evidence_start_column}-L${e.evidence_end_line}C${e.evidence_end_column}`);
    const base = { importerSourceRef: importerRel, importerSourceRevision: importerRevision, evidenceRefs: [...new Set(evidenceRefs)], canonicalAuthority: false };
    if (!parsed) { rejected.push({ reason: 'IMPORT_STATEMENT_UNPARSED', line: statement.evidence_start_line }); continue; }
    const bindingList = parsed.bindings.length ? parsed.bindings : [{ kind: 'side-effect', imported: null, local: null }];
    // Clause edges must agree with the statement's bindings, otherwise the evidence conflicts and the observation is rejected.
    const clauseText = clauseEdges.map((c) => String(c.to_evidence_key)).join(' ');
    const conflicting = parsed.bindings.some((b) => b.kind === 'named' && clauseEdges.length > 0 && !clauseText.includes(b.imported));
    if (conflicting) { rejected.push({ reason: 'CLAUSE_EVIDENCE_CONFLICTS_WITH_STATEMENT', line: statement.evidence_start_line }); continue; }

    const mod = resolveSpecifier({ fromRel: importerRel, specifier: parsed.specifier, manifest, aliases });
    for (const b of bindingList) {
      const importKind = b.kind === 'named' ? 'NAMED' : b.kind === 'default' ? 'DEFAULT' : b.kind === 'namespace' ? 'NAMESPACE' : 'SIDE_EFFECT';
      const rec = { ...base, moduleSpecifier: parsed.specifier, importKind, importedName: b.imported, localName: b.local, typeOnly: parsed.typeOnly || b.typeOnly === true, targetSourceRef: null, targetSourceRevision: null, targetSymbolId: null, targetSymbolVersionId: null, symbolVersionWorkspaceRevision: null, resolution: 'UNRESOLVED', reason: null };
      if (mod.status === 'EXTERNAL_MODULE') { rec.resolution = 'EXTERNAL_MODULE'; records.push(rec); continue; }
      if (mod.status === 'MODULE_AMBIGUOUS') { rec.resolution = 'AMBIGUOUS'; rec.reason = 'MODULE_AMBIGUOUS'; records.push(rec); continue; }
      if (mod.status !== 'MODULE_RESOLVED') { rec.reason = mod.reason ?? mod.status; records.push(rec); continue; }

      rec.targetSourceRef = mod.target; rec.targetSourceRevision = normRev(manifest.get(mod.target)); rec.resolution = 'MODULE_RESOLVED';
      if (importKind === 'SIDE_EFFECT' || importKind === 'NAMESPACE') { rec.reason = importKind === 'NAMESPACE' ? 'NAMESPACE_HAS_NO_SINGLE_SYMBOL' : 'NO_BINDING'; records.push(rec); continue; }
      const followed = followExport({ file: mod.target, name: importKind === 'DEFAULT' ? 'default' : b.imported, manifest, aliases, readSource });
      if (followed.status === 'STAR_AMBIGUOUS') { rec.resolution = 'AMBIGUOUS'; rec.reason = 'STAR_AMBIGUOUS'; records.push(rec); continue; }
      if (!followed.definingFile) { rec.reason = `EXPORT_${followed.status}`; records.push(rec); continue; }
      const definingRevision = normRev(manifest.get(followed.definingFile));
      rec.targetSourceRef = followed.definingFile; rec.targetSourceRevision = definingRevision;
      const wanted = followed.definingName;
      const refs = pathPrefixRule ? pathPrefixRule(followed.definingFile) : [followed.definingFile];
      const rows = refs.flatMap((r) => symbolVersions(r)).filter((r) => normRev(r.source_revision) === definingRevision && (r.qualified_name === wanted || r.qualified_name.endsWith(`.${wanted}`)));
      const stable = [...new Set(rows.map((r) => r.stable_symbol_id))];
      if (stable.length === 1) { rec.resolution = 'SYMBOL_VERSION_VERIFIED'; rec.targetSymbolId = stable[0]; rec.targetSymbolVersionId = rows.find((r) => r.stable_symbol_id === stable[0]).symbol_version_id ?? null; rec.symbolVersionWorkspaceRevision = rows[0].workspace_revision; }
      else if (stable.length > 1) { rec.resolution = 'AMBIGUOUS'; rec.reason = 'MULTIPLE_STABLE_SYMBOLS'; }
      else rec.reason = 'SYMBOL_VERSION_MISSING_AT_ADMITTED_REVISION';
      records.push(rec);
    }
  }
  return { records, rejected, orphanClauses: orphanClauses.length };
}

export { listExports };
