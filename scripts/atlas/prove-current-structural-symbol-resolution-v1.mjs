#!/usr/bin/env node

/**
 * Read-only GRAPH-RESOLVE-06B.2 proof.
 * Resolves current Graphify nominations against the frozen Tree-sitter
 * snapshot only. No database reads or writes, aliases, symbols, versions,
 * edges, or CandidateOrdinals are created here.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const snapshotPath = path.resolve(root, '.tmp/atlas/current-source-ast-snapshot-v1.ndjson');
const nominationsPath = path.resolve(root, '.tmp/atlas/current-graphify-symbol-nominations-v1.jsonl');
const outputPath = path.resolve(root, '.tmp/atlas/current-structural-symbol-resolution-v1.ndjson');
const reportPath = path.resolve(root, 'docs/reports/current-structural-symbol-resolution-v1.json');

const readNdjson = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)
  .map((line, index) => {
    try { return JSON.parse(line); } catch { return { __invalid: true, __line: index + 1 }; }
  });
const hash = (value) => value ? String(value).replace(/^sha256:/i, '').toLowerCase() : null;
const checksum = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

// This is an explicit repository namespace rule, not suffix/basename matching.
const namespaceRules = [{ id: 'SVELTEKIT_FRONTEND_ROOT', from: 'sveltekit-frontend/', to: '' }];
const canonicalSourceRef = (value) => {
  const text = String(value ?? '').replaceAll('\\', '/');
  const rule = namespaceRules.find((candidate) => text.startsWith(candidate.from));
  return rule ? text.slice(rule.from.length) : text;
};

const snapshots = readNdjson(snapshotPath);
const nominations = readNdjson(nominationsPath);
const astRows = snapshots.filter((row) => !row.__invalid);
const astBySource = new Map();
for (const row of astRows) {
  const key = `${canonicalSourceRef(row.sourceRef)}|${hash(row.sourceContentHash)}`;
  const rows = astBySource.get(key) ?? [];
  rows.push(row);
  astBySource.set(key, rows);
}

const counts = {
  nominations: nominations.length,
  invalidNominations: nominations.filter((row) => row.__invalid).length,
  sourceOnly: 0,
  astMatched: 0,
  treeBound: 0,
  treeNodeMissing: 0,
  exactFull: 0,
  exactSpanHash: 0,
  exactNodeHash: 0,
  ambiguousAstMatch: 0,
  noAstMatch: 0,
  sourceRevisionMismatch: 0,
  unsupportedSource: 0,
  stableSymbolBound: 0,
  stableSymbolMissing: 0,
  symbolVersionBound: 0,
  symbolVersionMissing: 0,
};

const results = [];
for (const nomination of nominations) {
  if (nomination.__invalid) continue;
  const sourceRef = canonicalSourceRef(nomination.source_ref);
  const contentHash = hash(nomination.source_content_hash ?? nomination.content_hash);
  const sourceRows = astBySource.get(`${sourceRef}|${contentHash}`) ?? [];
  const revisionRows = sourceRows.filter((row) =>
    String(row.graphifySourceRevision ?? '') === String(nomination.source_revision ?? '')
    || hash(row.sourceRevision) === contentHash);
  const spanRows = revisionRows.filter((row) =>
    Number(row.startByte) === Number(nomination.byte_start)
    && Number(row.endByte) === Number(nomination.byte_end));

  let resolution = 'NO_AST_MATCH';
  let matches = [];
  let matchedBy = [];
  if (!sourceRows.length) {
    counts.sourceOnly += 1;
  } else if (!revisionRows.length) {
    counts.sourceRevisionMismatch += 1;
  } else if (!spanRows.length) {
    counts.noAstMatch += 1;
  } else {
    const upstreamRows = nomination.upstream_node_id
      ? spanRows.filter((row) => String(row.upstreamNodeId ?? '') === String(nomination.upstream_node_id))
      : spanRows;
    matches = upstreamRows.length ? upstreamRows : spanRows;
    matchedBy = upstreamRows.length ? ['source_ref_namespace_rule', 'content_hash', 'source_revision', 'byte_span', 'upstream_node_id']
      : ['source_ref_namespace_rule', 'content_hash', 'source_revision', 'byte_span'];
    if (matches.length === 1) {
      resolution = upstreamRows.length ? 'EXACT_FULL' : 'EXACT_SPAN_HASH';
      counts.astMatched += 1;
      if (matches[0].treeNodeId) counts.treeBound += 1;
      else counts.treeNodeMissing += 1;
      counts[resolution === 'EXACT_FULL' ? 'exactFull' : 'exactSpanHash'] += 1;
    } else {
      resolution = 'AMBIGUOUS_AST_MATCH';
      counts.ambiguousAstMatch += 1;
    }
  }

  if (resolution === 'NO_AST_MATCH' && sourceRows.length && revisionRows.length) counts.noAstMatch += 1;
  const row = matches[0] ?? null;
  results.push({
    schema: 'atlas.current-structural-symbol-resolution.v1',
    nominationId: nomination.nomination_id,
    sourceRef: nomination.source_ref,
    canonicalSourceRef: sourceRef,
    sourceRevision: nomination.source_revision ?? null,
    sourceContentHash: nomination.source_content_hash ?? null,
    treeNodeId: row?.treeNodeId ?? null,
    upstreamNodeId: nomination.upstream_node_id ?? null,
    upstreamSymbolId: nomination.upstream_symbol_id ?? null,
    resolution,
    alignmentState: resolution.startsWith('EXACT')
      ? (row?.treeNodeId ? 'TREE_BOUND' : 'AST_MATCHED_TREE_NODE_MISSING')
      : 'SOURCE_ONLY',
    matchedBy,
    astCandidates: matches.map((candidate) => ({
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
      treeNodeId: candidate.treeNodeId,
      startByte: candidate.startByte,
      endByte: candidate.endByte,
      spanContentHash: candidate.spanContentHash,
      upstreamNodeId: candidate.upstreamNodeId,
    })),
    stableSymbolId: null,
    symbolVersionId: null,
    canonicalAuthority: false,
    canonicalWrites: false,
    edgeWrites: false,
  });
}

const resultText = results.map((row) => JSON.stringify(row)).join('\n') + (results.length ? '\n' : '');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(outputPath, resultText, 'utf8');
const report = {
  schema: 'atlas.current-structural-symbol-resolution-proof.v1',
  status: counts.ambiguousAstMatch === 0 && counts.invalidNominations === 0 ? 'READ_ONLY_PROVEN' : 'READ_ONLY_INCOMPLETE',
  graphResolveGate: 'GRAPH-RESOLVE-06B.2',
  snapshotPath: path.relative(root, snapshotPath).replaceAll('\\', '/'),
  nominationsPath: path.relative(root, nominationsPath).replaceAll('\\', '/'),
  outputPath: path.relative(root, outputPath).replaceAll('\\', '/'),
  snapshotChecksum: checksum(fs.readFileSync(snapshotPath)),
  resolutionChecksum: checksum(resultText),
  namespaceRules,
  counts,
  stableSymbolResolution: 'NOT_ATTEMPTED',
  symbolVersionResolution: 'NOT_ATTEMPTED',
  canonicalWrites: 0,
  structuralEdgeWrites: 0,
  databaseReads: 0,
  databaseWrites: 0,
  fuzzyMatches: 0,
  readOnly: true,
  nextGate: 'GRAPH-RESOLVE-06B.3_TREE_TO_STABLE_SYMBOL',
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
