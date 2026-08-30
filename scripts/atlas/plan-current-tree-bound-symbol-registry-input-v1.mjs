#!/usr/bin/env node

/**
 * Build a review-only current symbol-registry input plan from exact tree-bound
 * nominations. Proposed IDs are deterministic but are not authoritative until
 * a separately authorized promotion is reviewed and applied.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resolutionPath = path.resolve(root, '.tmp/atlas/current-structural-symbol-resolution-v1.ndjson');
const nominationsPath = path.resolve(root, '.tmp/atlas/current-graphify-symbol-nominations-v1.jsonl');
const outputPath = path.resolve(root, '.tmp/atlas/current-tree-bound-symbol-registry-input-v1.ndjson');
const reportPath = path.resolve(root, 'docs/reports/current-tree-bound-symbol-registry-input-v1.json');
const promotable = new Set(['function', 'method', 'class', 'interface', 'type', 'enum']);
const readJsonl = async (file) => (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const sha = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const canonicalSourceRef = (value) => String(value ?? '').replaceAll('\\', '/').replace(/^sveltekit-frontend\//, '');

const [resolutions, nominations] = await Promise.all([readJsonl(resolutionPath), readJsonl(nominationsPath)]);
const byId = new Map(nominations.map((row) => [row.nomination_id, row]));
const treeBound = resolutions.filter((row) => row.resolution?.startsWith('EXACT') && row.treeNodeId);
const entries = [];
for (const resolution of treeBound) {
  const nomination = byId.get(resolution.nominationId);
  const sourceRef = canonicalSourceRef(nomination.source_ref);
  const keyMaterial = JSON.stringify({
    sourceRef,
    sourceRevision: nomination.source_revision,
    kind: nomination.kind,
    name: nomination.name,
    startByte: nomination.byte_start,
    endByte: nomination.byte_end,
  });
  const canonicalKey = `symbol-key:${sha(keyMaterial).slice(0, 40)}`;
  const proposedStableSymbolId = `stable-symbol:${sha(canonicalKey)}`;
  entries.push({
    schema: 'atlas.current-tree-bound-symbol-registry-input.v1',
    nominationId: nomination.nomination_id,
    treeNodeId: resolution.treeNodeId,
    sourceRef,
    sourceRevision: nomination.source_revision,
    workspaceRevision: nomination.workspace_revision,
    sourceContentHash: nomination.source_content_hash,
    byteStart: nomination.byte_start,
    byteEnd: nomination.byte_end,
    kind: nomination.kind,
    language: nomination.language,
    name: nomination.name,
    qualifiedName: nomination.qualified_name,
    declarationHash: nomination.declaration_hash,
    upstreamNodeId: nomination.upstream_node_id,
    upstreamSymbolId: nomination.upstream_symbol_id,
    canonicalKey,
    proposedStableSymbolId,
    classification: promotable.has(nomination.kind) ? 'REGISTER_NEW_EXACT_REVIEW_ONLY' : 'NON_PROMOTABLE_KIND_REVIEW_ONLY',
    canonicalAuthority: false,
    promotionAuthorized: false,
    writes: false,
  });
}
entries.sort((a, b) => `${a.sourceRef}|${a.byteStart}|${a.byteEnd}|${a.kind}|${a.canonicalKey}`.localeCompare(`${b.sourceRef}|${b.byteStart}|${b.byteEnd}|${b.kind}|${b.canonicalKey}`));
const output = entries.map((row) => JSON.stringify(row)).join('\n') + (entries.length ? '\n' : '');
const counts = entries.reduce((acc, row) => { acc[row.classification] = (acc[row.classification] ?? 0) + 1; return acc; }, {});
const report = {
  schema: 'atlas.current-tree-bound-symbol-registry-input-plan.v1',
  gate: 'GRAPH-RESOLVE-06B.3',
  status: treeBound.length ? 'REVIEW_ONLY_PLAN_READY' : 'TREE_NODE_IDENTITY_REQUIRED',
  sourceResolutionPath: '.tmp/atlas/current-structural-symbol-resolution-v1.ndjson',
  nominationsPath: '.tmp/atlas/current-graphify-symbol-nominations-v1.jsonl',
  outputPath: '.tmp/atlas/current-tree-bound-symbol-registry-input-v1.ndjson',
  entryCount: entries.length,
  counts,
  planChecksum: `sha256:${sha(output)}`,
  identityPolicy: 'sourceRef + sourceRevision + kind + name + byte span; deterministic proposed IDs only',
  canonicalWrites: 0,
  databaseWrites: 0,
  aliasWrites: 0,
  symbolVersionWrites: 0,
  promotionAuthorized: false,
  readOnly: true,
  nextGate: treeBound.length ? 'REVIEW_CURRENT_REGISTRY_INPUT_BEFORE_ANY_PROMOTION' : 'TREE_NODE_IDENTITY_REQUIRED',
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(outputPath, output, 'utf8');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
