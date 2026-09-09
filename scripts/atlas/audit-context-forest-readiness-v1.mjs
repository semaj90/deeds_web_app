#!/usr/bin/env node

/**
 * Read-only Parent Atlas master readiness harness.
 * Aggregates existing receipts; it does not execute providers or mutate state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'parent-atlas-context-forest-readiness-v1.json');

const sources = {
  semanticOwner: 'docs/reports/semantic-768-writer-ownership-v1.json',
  fabric: 'docs/reports/atlas-canonical-projection-fabric-audit-2026-09-09.json',
  latent: 'docs/reports/latent-representation-identity-audit-2026-09-09.json',
  sourceHydration: 'docs/reports/current-source-evidence-hydration-v1.json',
  graphifyAuthority: 'docs/reports/current-graphify-snapshot-authority-v1.json',
  indexing: 'docs/reports/atlas-indexing-surfaces-v1.json',
};

function readJson(relative) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8')); }
  catch { return null; }
}

function statusOf(value, fallback = 'NOT_PROVEN') {
  if (!value) return fallback;
  return value.status || value.verdict || value.overallVerdict || value.promotionStatus || fallback;
}

function gate(name, status, proofLevel, blocking, evidence) {
  return { gate: name, status, proofLevel, blocking, writesProven: false, evidence };
}

function isProvenStatus(status) {
  return ['PASS', 'PROVEN', 'CONTRACT_PROVEN', 'CURRENT_SNAPSHOT_PROVEN', 'CURRENT_GRAPHIFY_SOURCE_PROVEN'].includes(status);
}

function main() {
  const loaded = Object.fromEntries(Object.entries(sources).map(([key, file]) => [key, readJson(file)]));
  const fabric = loaded.fabric;
  const semantic = loaded.semanticOwner;
  const latent = loaded.latent;
  const gates = [
    gate('Leiden projection incident', 'NOT_PROVEN', 'NOT_RUN', true, 'No current bounded Leiden projection receipt supplied'),
    gate('Semantic-768 owner', semantic?.verdict ?? 'OWNER_NOT_PROVEN', 'PARTIAL_PROVEN', true, sources.semanticOwner),
    gate('Graphify source membership', statusOf(loaded.graphifyAuthority), 'LIVE_PROVEN', !isProvenStatus(statusOf(loaded.graphifyAuthority)), sources.graphifyAuthority),
    gate('Packet/chunk/symbol identity', fabric?.IDENTITY_ALIGNED?.verdict ?? 'NOT_PROVEN', 'PARTIAL_PROVEN', true, sources.fabric),
    gate('Representation ledger', latent?.proofStatus?.LAT_AUDIT10_REPRESENTATION_LEDGER ?? 'NOT_PROVEN', 'READ_ONLY_AUDIT', true, sources.latent),
    gate('Projection identity', fabric?.PROJECTIONS_CHECKSUM_ALIGNED?.verdict ?? 'NOT_PROVEN', 'NOT_PROVEN', true, sources.fabric),
    gate('Qdrant payload', latent?.proofStatus?.LAT_AUDIT5_QDRANT_JOIN_CLASSIFIED ?? 'NOT_PROVEN', 'PARTIAL_PROVEN', true, sources.latent),
    gate('Neo4j identity', 'NOT_PROVEN', 'NOT_RUN', true, 'No current cross-store identity receipt supplied'),
    gate('RRF owner', 'CONTRACT_PROVEN', 'CONTRACT_PROVEN', false, 'SearchRuntime ownership contract'),
    gate('Ordinal/graph manifest', fabric?.ORDINAL_MAP_SEALED?.verdict ?? 'ABSENT', 'NOT_PROVEN', true, sources.fabric),
    gate('Hypergraph incidence', 'NOT_PROVEN', 'NOT_RUN', true, 'No current revision-qualified incidence receipt supplied'),
    gate('NetworkX context forest', 'PARTIAL_PROVEN', 'FIXTURE_PROVEN', true, 'ContextForestV1 implementation and direct smoke only'),
    gate('cuGraph parity', 'NOT_PROVEN', 'NOT_RUN', true, 'No live WSL2/RAPIDS parity receipt supplied'),
    gate('Sparse tensor', 'NOT_PROVEN', 'NOT_RUN', true, 'No sealed sparse tensor receipt supplied'),
    gate('Leiden Qdrant canary', 'NOT_PROVEN', 'NOT_RUN', true, 'No authorized canary receipt supplied'),
    gate('Cross-store canary', 'NOT_PROVEN', 'NOT_RUN', true, 'Independent current Postgres/Qdrant/graph readback absent'),
    gate('Postgres/pgvector performance', 'NOT_PROVEN', 'NOT_RUN', false, sources.indexing),
  ];
  const blockerPriority = ['Graphify source membership', 'Semantic-768 owner', 'Packet/chunk/symbol identity', 'Representation ledger', 'Projection identity', 'Neo4j identity', 'Ordinal/graph manifest', 'Hypergraph incidence', 'Cross-store canary', 'Leiden projection incident'];
  const firstBlocker = blockerPriority.map((name) => gates.find((item) => item.gate === name)).find((item) => item?.blocking && !isProvenStatus(item.status));
  const report = {
    schema: 'atlas.parent-atlas-context-forest-readiness.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_RECEIPT_RECONCILIATION',
    gates,
    authorities: {
      canonicalAuthority: 'PostgreSQL_UNPROVEN_FOR_CURRENT_WORKSPACE',
      semanticAuthority: semantic?.ownerDecision?.selectedWriter ?? null,
      sourceAuthority: statusOf(loaded.sourceHydration),
      symbolAuthority: 'NOT_PROVEN',
      representationAuthority: latent?.proofStatus?.LAT_AUDIT10_REPRESENTATION_LEDGER ?? 'NOT_PROVEN',
      graphAuthority: statusOf(loaded.graphifyAuthority),
      projectionIdentityAuthority: 'NOT_PROVEN',
    },
    forestRuntimeReady: 'PARTIAL_PROVEN',
    aceAdmissionReady: false,
    fullWorkspaceSafe: false,
    firstBlockingGate: firstBlocker?.gate ?? null,
    nextGate: 'CURRENT-SOURCE-OWNER-RECONCILIATION-01',
    safeNextCommand: 'node scripts/atlas/audit-current-graphify-snapshot-authority-v1.mts',
    writesPerformed: false,
    sources,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.fullWorkspaceSafe ? 'SAFE_TO_PROJECT' : 'NOT_SAFE_TO_PROJECT', firstBlockingGate: report.firstBlockingGate, nextGate: report.nextGate, reportPath: REPORT_PATH, writesPerformed: false }, null, 2));
}

main();
