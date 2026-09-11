#!/usr/bin/env node

/** Read-only preflight for Graphify candidate-artifact publication safety. */
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalPath = resolve(ROOT, 'docs/graph/codebase-graph.json');
// The canonical graph writer is the full-repository indexer. The downstream
// chain consumes the graph but does not own its publication contract.
const builderPath = resolve(ROOT, 'sveltekit-frontend/scripts/index-codebase-fast.mjs');
const exportPath = resolve(ROOT, 'scripts/atlas/generate-graph-exports.mjs');
const reportPath = resolve(ROOT, 'docs/reports/graphify-atomic-publication-preflight-v1.json');

async function exists(path) { try { await access(path, constants.F_OK); return true; } catch { return false; } }
const [builderText, exportText] = await Promise.all([readFile(builderPath, 'utf8'), readFile(exportPath, 'utf8')]);
const canonicalExists = await exists(canonicalPath);
const checks = {
  canonicalArtifactPresent: canonicalExists,
  builderUsesRunScopedTemporaryPath: /\.tmp|tmpFile/.test(builderText),
  builderUsesAtomicRename: /fs\.rename|renameSync/.test(builderText),
  exportUsesTemporaryFallback: /\.tmp/.test(exportText) && /renameSync/.test(exportText),
  candidateValidationHookPresent: /validate|checksum|graphRevision|sourceMembershipChecksum/i.test(builderText + exportText),
  noDirectProgressiveCanonicalWriteProven: !/writeFile(?:Sync)?\([^\n]*codebase-graph\.json/.test(builderText),
};
let canonicalBytes = null;
if (canonicalExists) canonicalBytes = (await stat(canonicalPath)).size;
const passed = Object.values(checks).every(Boolean);
const report = {
  schema: 'atlas.graphify-atomic-publication-preflight.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  status: passed ? 'PUBLICATION_PREFLIGHT_READY_CANDIDATE_ONLY' : 'PUBLICATION_PREFLIGHT_BLOCKED',
  proofLevel: 'PARTIAL_PROVEN',
  authority: false,
  writesPerformed: false,
  canonicalArtifact: { path: 'docs/graph/codebase-graph.json', present: canonicalExists, bytes: canonicalBytes },
  checks,
  admission: { candidateRunAllowed: passed, canonicalPromotionAllowed: false, requiresSealedSnapshotBinding: true, requiresIndependentReceipt: true },
  blockers: [
    ...(!canonicalExists ? ['CANONICAL_ARTIFACT_ABSENT_OR_NOT_READABLE'] : []),
    'SEALED_SNAPSHOT_BINDING_NOT_PROVEN',
    'CANDIDATE_GRAPH_RECEIPT_NOT_PRESENT',
    'CANONICAL_PROMOTION_NOT_AUTHORIZED',
  ],
  nextGate: 'GRAPHIFY-SNAPSHOT-BINDING-01',
  safeNextCommand: 'npm run atlas:graphify:snapshot-binding:audit',
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, canonicalArtifactPresent: canonicalExists, checksPassed: Object.values(checks).filter(Boolean).length, checkCount: Object.keys(checks).length, authority: false, writesPerformed: false, reportPath }, null, 2));
