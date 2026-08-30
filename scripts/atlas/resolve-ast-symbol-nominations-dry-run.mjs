#!/usr/bin/env node

/** Read-only resolution of AST nominations against the active symbol registry. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = path.resolve(root, process.argv.find((arg) => arg.startsWith('--input='))?.slice(8)
  ?? '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl');
const output = path.resolve(root, process.argv.find((arg) => arg.startsWith('--output='))?.slice(9)
  ?? '.tmp/atlas/graphify-file-index-v1/ast-symbol-resolution.jsonl');

const registrySql = `
SELECT canonical_key, stable_symbol_id, 'canonical' AS source
FROM atlas_symbol_registry WHERE status = 'active'
UNION ALL
SELECT alias_key, stable_symbol_id, 'alias' AS source
FROM atlas_symbol_aliases
ORDER BY canonical_key, stable_symbol_id, source;
`;
const versionSql = `
SELECT symbol_version_id, stable_symbol_id, source_ref, source_revision,
       upstream_node_id, upstream_symbol_id, upstream_chunk_id,
       declaration_hash
FROM atlas_symbol_versions
WHERE source_ref IS NOT NULL AND source_revision IS NOT NULL
ORDER BY source_ref, source_revision, symbol_version_id;
`;
const astSql = `
SELECT tree_node_id, source_ref_key, relative_path, source_revision,
       start_byte, end_byte, node_kind, source_content_hash,
       normalized_node_hash, qualified_symbol
FROM atlas_ast_nodes
WHERE source_revision IS NOT NULL
ORDER BY source_ref_key, relative_path, source_revision,
         start_byte, end_byte, node_kind, tree_node_id;
`;
const raw = execFileSync('docker', [
  'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db',
  '-At', '-F', '|', '-c', registrySql,
], {
  cwd: root,
  encoding: 'utf8',
  timeout: 30000,
  maxBuffer: 64 * 1024 * 1024,
});

const versionRaw = execFileSync('docker', [
  'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db',
  '-At', '-F', '|', '-c', versionSql,
], {
  cwd: root,
  encoding: 'utf8',
  timeout: 30000,
  maxBuffer: 64 * 1024 * 1024,
});

const astRaw = execFileSync('docker', [
  'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db',
  '-At', '-F', '|', '-c', astSql,
], {
  cwd: root,
  encoding: 'utf8',
  timeout: 30000,
  maxBuffer: 64 * 1024 * 1024,
});

const registry = new Map();
for (const line of raw.split(/\r?\n/).filter(Boolean)) {
  const [key, stableId, source] = line.split('|');
  if (!key || !stableId) continue;
  const values = registry.get(key) ?? [];
  values.push({ stable_symbol_id: stableId, source });
  registry.set(key, values);
}

const symbolVersions = new Map();
for (const line of versionRaw.split(/\r?\n/).filter(Boolean)) {
  const [symbolVersionId, stableSymbolId, sourceRef, sourceRevision,
    upstreamNodeId, upstreamSymbolId, upstreamChunkId, declarationHash] = line.split('|');
  if (!symbolVersionId || !sourceRef || !sourceRevision) continue;
  const key = `${sourceRef}|${sourceRevision}`;
  const values = symbolVersions.get(key) ?? [];
  values.push({ symbolVersionId, stableSymbolId, sourceRef, sourceRevision,
    upstreamNodeId: upstreamNodeId || null,
    upstreamSymbolId: upstreamSymbolId || null,
    upstreamChunkId: upstreamChunkId || null,
    declarationHash: declarationHash || null });
  symbolVersions.set(key, values);
}

const astRows = [];
for (const line of astRaw.split(/\r?\n/).filter(Boolean)) {
  const [treeNodeId, sourceRefKey, relativePath, sourceRevision,
    startByte, endByte, nodeKind, sourceContentHash,
    normalizedNodeHash, qualifiedSymbol] = line.split('|');
  if (!treeNodeId || !sourceRevision) continue;
  astRows.push({
    treeNodeId,
    sourceRefKey: sourceRefKey || null,
    relativePath: relativePath || null,
    sourceRevision,
    startByte: Number(startByte),
    endByte: Number(endByte),
    nodeKind: nodeKind || null,
    sourceContentHash: sourceContentHash || null,
    normalizedNodeHash: normalizedNodeHash || null,
    qualifiedSymbol: qualifiedSymbol || null,
  });
}

const same = (left, right) => left != null && right != null && String(left) === String(right);
const sourceMatches = (row, nomination) =>
  same(row.sourceRevision, nomination.source_revision)
  && (same(row.sourceRefKey, nomination.source_ref) || same(row.relativePath, nomination.source_ref));

function resolveAst(nomination) {
  const sourceRows = astRows.filter((row) => sourceMatches(row, nomination));
  const spanRows = sourceRows.filter((row) =>
    Number(row.startByte) === Number(nomination.byte_start)
    && Number(row.endByte) === Number(nomination.byte_end));
  const fullRows = spanRows.filter((row) =>
    same(row.normalizedNodeHash, nomination.normalized_node_hash ?? nomination.declaration_hash));
  if (fullRows.length === 1) return { resolution: 'EXACT_FULL', matchedBy: ['source_ref', 'source_revision', 'byte_span', 'normalized_node_hash'], rows: fullRows };
  if (fullRows.length > 1) return { resolution: 'AMBIGUOUS', matchedBy: ['source_ref', 'source_revision', 'byte_span', 'normalized_node_hash'], rows: fullRows };

  const contentRows = spanRows.filter((row) =>
    same(row.sourceContentHash, nomination.source_content_hash ?? nomination.content_hash));
  if (contentRows.length === 1) return { resolution: 'EXACT_SPAN_HASH', matchedBy: ['source_ref', 'source_revision', 'byte_span', 'source_content_hash'], rows: contentRows };
  if (contentRows.length > 1) return { resolution: 'AMBIGUOUS', matchedBy: ['source_ref', 'source_revision', 'byte_span', 'source_content_hash'], rows: contentRows };

  const nodeRows = sourceRows.filter((row) =>
    same(row.normalizedNodeHash, nomination.normalized_node_hash ?? nomination.declaration_hash)
    && (!nomination.node_kind || same(row.nodeKind, nomination.node_kind))
    && (!nomination.qualified_symbol || same(row.qualifiedSymbol, nomination.qualified_symbol)));
  if (nodeRows.length === 1) return { resolution: 'EXACT_NODE_HASH', matchedBy: ['source_ref', 'source_revision', 'normalized_node_hash', 'node_kind', 'qualified_symbol'], rows: nodeRows };
  if (nodeRows.length > 1) return { resolution: 'AMBIGUOUS', matchedBy: ['source_ref', 'source_revision', 'normalized_node_hash', 'node_kind', 'qualified_symbol'], rows: nodeRows };
  return { resolution: sourceRows.length ? 'AST_BOUND_SYMBOL_UNRESOLVED' : 'NO_AST_MATCH', matchedBy: [], rows: [] };
}

const inputLines = (await fs.readFile(input, 'utf8')).split(/\r?\n/).filter(Boolean);
const rows = [];
const counts = { canonical: 0, ambiguous: 0, unresolved: 0, invalid: 0 };
for (const line of inputLines) {
  let nomination;
  try { nomination = JSON.parse(line); } catch { counts.invalid += 1; continue; }
  const matches = registry.get(nomination.symbol_key) ?? [];
  const revisionMatches = symbolVersions.get(`${nomination.source_ref}|${nomination.source_revision}`) ?? [];
  const ast = resolveAst(nomination);
  const stableIds = [...new Set(matches.map((item) => item.stable_symbol_id))];
  const status = stableIds.length === 1 ? 'CANONICAL' : stableIds.length > 1 ? 'AMBIGUOUS' : 'UNRESOLVED';
  counts[status.toLowerCase()] += 1;
  rows.push({
    schema: 'atlas.ast-symbol-resolution-dry-run-row.v1',
    nomination_id: nomination.nomination_id,
    symbol_key: nomination.symbol_key,
    status,
    stable_symbol_id: stableIds.length === 1 ? stableIds[0] : null,
    candidate_symbol_ids: stableIds,
    resolution_basis: stableIds.length === 1 ? matches[0].source === 'alias' ? 'existing_alias' : 'exact_symbol_key' : 'unresolved',
    revision_qualified_symbol_versions: revisionMatches,
    revision_qualified_match_count: revisionMatches.length,
    ast_resolution: ast.resolution,
    ast_matched_by: ast.matchedBy,
    ast_candidates: ast.rows,
    registry_revision: 'read-only-live-registry',
    canonical_write: false,
  });
}

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
const report = {
  schema: 'atlas.ast-symbol-resolution-dry-run-receipt.v1',
  status: 'READ_ONLY_COMPLETE',
  input,
  output,
  input_nominations: inputLines.length,
  registry_keys: registry.size,
  ...counts,
  revision_qualified_symbol_version_rows: [...symbolVersions.values()].reduce((total, rows) => total + rows.length, 0),
  ast_snapshot_rows: astRows.length,
  ast_resolution_counts: rows.reduce((countsByResolution, row) => {
    countsByResolution[row.ast_resolution] = (countsByResolution[row.ast_resolution] ?? 0) + 1;
    return countsByResolution;
  }, {}),
  canonical_writes: false,
  database_writes: false,
};
const reportPath = path.join(root, 'docs/reports/ast-symbol-resolution-dry-run-v1.json');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
