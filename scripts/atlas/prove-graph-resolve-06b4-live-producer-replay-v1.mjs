#!/usr/bin/env node

/**
 * Bounded read-only producer replay for GRAPH-RESOLVE-06B.4.
 * Joins current Graphify nominations to the frozen AST and exact registry /
 * symbol-version resolution artifacts. It does not write graph edges.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nominationsPath = path.resolve(root, '.tmp/atlas/current-graphify-symbol-nominations-v1.jsonl');
const astResolutionPath = path.resolve(root, '.tmp/atlas/current-structural-symbol-resolution-v1.ndjson');
const identityResolutionPath = path.resolve(root, '.tmp/atlas/tree-bound-symbol-registry-resolution-v1.ndjson');
const materializerReportPath = path.resolve(root, 'docs/reports/ast-symbol-version-materialization-v1.json');
const reportPath = path.resolve(root, 'docs/reports/graph-resolve-06b4-live-producer-replay-v1.json');
const readJsonl = async (file) => (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

const [nominations, astRows, identityRows, materializer] = await Promise.all([
  readJsonl(nominationsPath),
  readJsonl(astResolutionPath),
  readJsonl(identityResolutionPath),
  fs.readFile(materializerReportPath, 'utf8').then(JSON.parse),
]);
const nominationById = new Map(nominations.map((row) => [row.nomination_id, row]));
const astById = new Map(astRows.map((row) => [row.nominationId, row]));
const identityById = new Map(identityRows.map((row) => [row.nominationId, row]));
const eligible = identityRows.filter((row) => row.registryResolution === 'EXACT_CANONICAL_KEY' && row.symbolVersionResolution === 'EXACT' && row.symbolVersionIds?.length === 1);
const failures = [];
for (const identity of eligible) {
  const nomination = nominationById.get(identity.nominationId);
  const ast = astById.get(identity.nominationId);
  if (!nomination || !ast || ast.treeNodeId !== identity.treeNodeId) failures.push({ nominationId: identity.nominationId, reason: 'AST_BINDING_MISMATCH' });
  if (!nomination?.source_revision || !nomination?.workspace_revision) failures.push({ nominationId: identity.nominationId, reason: 'REVISION_MISSING' });
  if (!identity.stableSymbolId || !identity.symbolVersionIds[0]) failures.push({ nominationId: identity.nominationId, reason: 'TARGET_IDENTITY_MISSING' });
}

const payload = {
  schema: 'atlas.graph-resolve-06b4-live-producer-replay.v1',
  gate: 'GRAPH-RESOLVE-06B.4',
  inputNominationCount: nominations.length,
  astResolutionCount: astRows.length,
  identityResolutionCount: identityRows.length,
  eligibleCount: eligible.length,
  eligibleIdentityFailures: failures.length,
  materializer: {
    mode: materializer.mode,
    rowsAttempted: materializer.rowsAttempted,
    rowsInserted: materializer.rowsInserted,
    rowsAlreadyPresent: materializer.rowsAlreadyPresent,
    identityBridgeOutcomes: materializer.identityBridgeOutcomes ?? null,
  },
  edgeWrites: 0,
  canonicalWrites: 0,
  databaseWrites: false,
  failures,
};
const canonical = JSON.stringify(payload);
const report = {
  ...payload,
  replayChecksum: digest(canonical),
  status: eligible.length > 0 && failures.length === 0 && materializer.identityBridgeOutcomes?.RESOLVED === eligible.length && materializer.identityBridgeOutcomes?.UNRESOLVED === 0 && materializer.identityBridgeOutcomes?.AMBIGUOUS === 0 && materializer.rowsInserted === 0 && materializer.rowsAlreadyPresent === eligible.length ? 'READ_ONLY_PRODUCER_REPLAY_PROVEN' : 'READ_ONLY_PRODUCER_REPLAY_INCOMPLETE',
  readOnly: true,
  nextGate: 'GRAPH-RESOLVE-06B.4_REPLAY_SECOND_RUN_AND_EDGE_ADMISSION_SEPARATE',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
