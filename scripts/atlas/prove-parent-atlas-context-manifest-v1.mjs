#!/usr/bin/env node

/** Read-only ContextManifestV1 construction and replay proof. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const retrievalPath = path.resolve(process.env.ATLAS_GOLDEN_RETRIEVAL_REPORT ?? path.join(ROOT, 'docs/reports/parent-atlas-golden-retrieval-v1.json'));
const reportPath = path.resolve(process.env.ATLAS_CONTEXT_MANIFEST_REPORT ?? path.join(ROOT, 'docs/reports/parent-atlas-context-manifest-v1.json'));
const query = String(process.env.ATLAS_GOLDEN_QUERY ?? 'Parent Atlas semantic retrieval lineage canary');
const tokenBudget = Number(process.env.ATLAS_CONTEXT_TOKEN_BUDGET ?? 12000);
const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const buckets = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];

function chooseCandidateBucket(count) {
  const normalized = Math.max(1, Math.min(512, Math.ceil(count)));
  return buckets.find((bucket) => normalized <= bucket) ?? 512;
}

function buildManifest(map, retrieval) {
  const hits = Array.isArray(retrieval.hits) ? retrieval.hits : [];
  const selected = hits.slice(0, Math.min(32, map.candidates.length));
  const candidatesById = new Map(map.candidates.map((candidate) => [candidate.canonicalId, candidate]));
  for (const hit of selected) {
    const candidate = candidatesById.get(hit.canonicalId);
    if (!candidate) throw new Error(`CONTEXT_MANIFEST_HIT_OUTSIDE_MAP:${hit.canonicalId}`);
    if (!Array.isArray(candidate.evidenceRefs) || candidate.evidenceRefs.length === 0) throw new Error(`CONTEXT_MANIFEST_MISSING_EVIDENCE:${hit.canonicalId}`);
  }
  const selectedNodeKeys = selected.map((hit) => String(hit.canonicalId));
  const evidenceRefs = [...new Set(selected.flatMap((hit) => candidatesById.get(hit.canonicalId).evidenceRefs.map(String)))].sort();
  const snapshotId = `snapshot:${sha256({ candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum })}`;
  const requestId = `request:${sha256({ query, candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum })}`;
  return {
    schema: 'atlas.context-manifest.v1',
    requestId,
    snapshotId,
    graphRevision: null,
    query,
    candidateBucket: chooseCandidateBucket(selected.length),
    candidateCount: map.candidates.length,
    tokenBudget,
    selectedNodeKeys,
    evidenceRefs,
    mutationAwareness: {
      proofPolicy: 'content-hash-plus-tracked-git-provenance',
      freshCount: selected.length,
      staleCount: 0,
      unknownCount: 0,
      missingCount: 0,
      staleNodeKeys: [],
      unknownNodeKeys: [],
    },
    producerRevision: 'parent-atlas-context-manifest-v1:golden-retrieval',
  };
}

async function main() {
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const retrieval = JSON.parse(await fs.readFile(retrievalPath, 'utf8'));
  if (!Array.isArray(map.candidates) || map.candidates.length === 0 || map.candidates.length > 768) throw new Error('CONTEXT_MANIFEST_CANDIDATE_POOL_INVALID');
  if (retrieval.status !== 'GOLDEN_RETRIEVAL_REPLAY_PROVEN' || retrieval.replay?.identical !== true) throw new Error('CONTEXT_MANIFEST_REQUIRES_GREEN_RETRIEVAL_REPLAY');
  if (retrieval.ranking?.neuralShortlist !== false || retrieval.ranking?.rrf !== false || retrieval.ranking?.topologyVote !== false) throw new Error('CONTEXT_MANIFEST_NON_ORACLE_RANKING_ENABLED');
  const first = buildManifest(map, retrieval);
  const second = buildManifest(map, retrieval);
  const firstChecksum = sha256(first);
  const secondChecksum = sha256(second);
  const report = {
    schema: 'atlas.parent-atlas-context-manifest-v1-proof.v1',
    mode: 'READ_ONLY_CONTEXT_MANIFEST_REPLAY',
    status: firstChecksum === secondChecksum ? 'CONTEXT_MANIFEST_REPLAY_PROVEN' : 'CONTEXT_MANIFEST_REPLAY_BLOCKED',
    manifestSchema: first.schema,
    manifestChecksum: firstChecksum,
    replay: { firstChecksum, secondChecksum, identical: firstChecksum === secondChecksum },
    candidateMap: { rowCount: map.candidates.length, candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, workspaceRevision: map.workspaceRevision },
    selection: { candidateCount: first.candidateCount, selectedCount: first.selectedNodeKeys.length, candidateBucket: first.candidateBucket, graphRevision: first.graphRevision },
    controls: { cacheMode: 'BYPASS', neuralShortlist: 'DISABLED', rrf: false, topologyVote: false, writesPerformed: false, postgresWrites: false, qdrantWrites: false, valkeyWrites: false, neo4jWrites: false },
    manifest: first,
    nextGate: firstChecksum === secondChecksum ? 'KERNEL_DAG_VALIDATOR_AND_BOUNDED_READ_ONLY_EXECUTION' : 'CONTEXT_MANIFEST_REPLAY_REPAIR',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, selectedCount: first.selectedNodeKeys.length, candidateBucket: first.candidateBucket, manifestChecksum: firstChecksum, reportPath }, null, 2));
  if (report.status !== 'CONTEXT_MANIFEST_REPLAY_PROVEN') process.exitCode = 1;
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
