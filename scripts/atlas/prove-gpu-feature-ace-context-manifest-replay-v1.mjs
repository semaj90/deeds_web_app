#!/usr/bin/env node

/** Read-only proof: 8098 graph enrichment -> ACE -> FanoutContextCompilerV1. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontend = path.join(root, 'sveltekit-frontend');
const map = JSON.parse(await fs.readFile(path.join(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'), 'utf8'));
const matrix = JSON.parse(await fs.readFile(path.join(root, 'docs/reports/current-candidate-feature-matrix-manifest-v1.json'), 'utf8'));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;

const [{ selectAceCardsV2 }, { adaptGpuFeatureEnrichmentV1, gpuFeatureBundleToAceCardsV1 }, { aceCardsToFanoutEvidenceBundleV1 }, { compileFanoutContextV1 }] = await Promise.all([
  import(pathToFileURL(path.join(frontend, 'src/lib/server/atlas/context/ace-card-selection-v2.ts')).href),
  import(pathToFileURL(path.join(frontend, 'src/lib/server/atlas/gpu/gpu-feature-enrichment-adapter-v1.ts')).href),
  import(pathToFileURL(path.join(frontend, 'src/lib/server/atlas/context/gpu-feature-ace-context-adapter-v1.ts')).href),
  import(pathToFileURL(path.join(frontend, 'src/lib/server/atlas/context/fanout-context-compiler-v1.ts')).href),
]);

const request = { artifactPath: 'docs/reports/embedding-tile-artifacts/embedding-tiles-v1.arrow', featurePath: 'docs/reports/current-graph-feature-gather-v1.json' };
const response = async () => {
  const result = await fetch('http://127.0.0.1:8098/v1/tile-artifact/enrich', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  if (!result.ok) throw new Error(`GPU_ENRICH_HTTP_${result.status}:${await result.text()}`);
  return result.json();
};

const build = async () => {
  const enriched = await response();
  const bundle = adaptGpuFeatureEnrichmentV1({ response: enriched, candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, expectedCandidateOrdinals: map.candidates.map((candidate) => candidate.candidateOrdinal) });
  const identities = map.candidates.map((candidate) => ({ candidateOrdinal: candidate.candidateOrdinal, packetKey: candidate.packetKey, sourceRef: candidate.sourceRef, sourceRevision: candidate.sourceRevision, workspaceRevision: candidate.workspaceRevision }));
  const cards = gpuFeatureBundleToAceCardsV1({ bundle, workspaceRevision: map.workspaceRevision, candidates: identities });
  const selection = selectAceCardsV2({ cards, query: 'graph pagerank topology', workspaceRevision: map.workspaceRevision, candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, maxCards: 7, tokenBudget: 300 });
  const fanout = aceCardsToFanoutEvidenceBundleV1({ cards: selection.selected, workspaceRevision: map.workspaceRevision, candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, tokenizerRevision: 'atlas-ace-graph-card-tokenizer-v1', tokenBudget: 300, edgePolicyRevision: 'gpu-feature-graph-edge-v1', maxHopDepth: 0, representationRevisions: { semantic_768: matrix.featureRevision ?? 'semantic_768:graph-feature-replay' } });
  return compileFanoutContextV1({ bundle: fanout, estimatedTokenCount: fanout.summary.text.split(/\s+/).filter(Boolean).length });
};

const first = await build();
const second = await build();
const firstChecksum = sha256(first);
const secondChecksum = sha256(second);
const report = {
  schema: 'atlas.gpu-feature-ace-context-manifest-replay.v1',
  mode: 'READ_ONLY_GPU_FEATURE_ACE_CONTEXT_MANIFEST_REPLAY',
  status: firstChecksum === secondChecksum ? 'GPU_FEATURE_CONTEXT_MANIFEST_REPLAY_PROVEN' : 'GPU_FEATURE_CONTEXT_MANIFEST_REPLAY_BLOCKED',
  compilerSchema: first.schema,
  selectedCandidateOrdinals: first.candidateOrdinals,
  evidenceRefs: first.evidenceRefs,
  manifestChecksum: firstChecksum,
  replay: { firstChecksum, secondChecksum, identical: firstChecksum === secondChecksum },
  controls: { canonicalAuthority: false, rankingPromotion: false, synthesis: false, postgresWrites: false, qdrantWrites: false, valkeyWrites: false, neo4jWrites: false },
};
const reportPath = path.join(root, 'docs/reports/gpu-feature-ace-context-manifest-replay-v1.json');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
if (report.status !== 'GPU_FEATURE_CONTEXT_MANIFEST_REPLAY_PROVEN') process.exitCode = 1;
