#!/usr/bin/env node

/** Read-only proof: compiled ContextManifest -> bounded Ornith synthesis replay. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontend = path.join(root, 'sveltekit-frontend');
const map = JSON.parse(await fs.readFile(path.join(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'), 'utf8'));
const contextProof = JSON.parse(await fs.readFile(path.join(root, 'docs/reports/gpu-feature-ace-context-manifest-replay-v1.json'), 'utf8'));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;

if (contextProof.status !== 'GPU_FEATURE_CONTEXT_MANIFEST_REPLAY_PROVEN') throw new Error('ORNITH_REQUIRES_CONTEXT_MANIFEST_REPLAY');

const [{ selectAceCardsV2 }, { adaptGpuFeatureEnrichmentV1, gpuFeatureBundleToAceCardsV1 }, { aceCardsToFanoutEvidenceBundleV1 }, { compileFanoutContextV1 }] = await Promise.all([
  import(pathToFileURL(path.join(frontend, 'src/lib/server/atlas/context/ace-card-selection-v2.ts')).href),
  import(pathToFileURL(path.join(frontend, 'src/lib/server/atlas/gpu/gpu-feature-enrichment-adapter-v1.ts')).href),
  import(pathToFileURL(path.join(frontend, 'src/lib/server/atlas/context/gpu-feature-ace-context-adapter-v1.ts')).href),
  import(pathToFileURL(path.join(frontend, 'src/lib/server/atlas/context/fanout-context-compiler-v1.ts')).href),
]);

const enrich = async () => {
  const response = await fetch('http://127.0.0.1:8098/v1/tile-artifact/enrich', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ artifactPath: 'docs/reports/embedding-tile-artifacts/embedding-tiles-v1.arrow', featurePath: 'docs/reports/current-graph-feature-gather-v1.json' }),
  });
  if (!response.ok) throw new Error(`ORNITH_GPU_ENRICH_HTTP_${response.status}`);
  return response.json();
};

const buildContext = async () => {
  const bundle = adaptGpuFeatureEnrichmentV1({ response: await enrich(), candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, expectedCandidateOrdinals: map.candidates.map((candidate) => candidate.candidateOrdinal) });
  const identities = map.candidates.map((candidate) => ({ candidateOrdinal: candidate.candidateOrdinal, packetKey: candidate.packetKey, sourceRef: candidate.sourceRef, sourceRevision: candidate.sourceRevision, workspaceRevision: candidate.workspaceRevision }));
  const cards = gpuFeatureBundleToAceCardsV1({ bundle, workspaceRevision: map.workspaceRevision, candidates: identities });
  const selection = selectAceCardsV2({ cards, query: 'graph pagerank topology', workspaceRevision: map.workspaceRevision, candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, maxCards: 7, tokenBudget: 300 });
  const fanout = aceCardsToFanoutEvidenceBundleV1({ cards: selection.selected, workspaceRevision: map.workspaceRevision, candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, tokenizerRevision: 'atlas-ace-graph-card-tokenizer-v1', tokenBudget: 300, edgePolicyRevision: 'gpu-feature-graph-edge-v1', maxHopDepth: 0, representationRevisions: { semantic_768: 'semantic_768:graph-feature-replay' } });
  return compileFanoutContextV1({ bundle: fanout, estimatedTokenCount: fanout.summary.text.split(/\s+/).filter(Boolean).length });
};

const context = await buildContext();
const model = process.env.ORNITH_MODEL ?? 'ornith-1.5-9b';
const prompt = [
  'Use only the supplied ContextManifest. Do not infer missing source facts.',
  'Return one JSON object only with keys summary, evidenceRefs, and confidence.',
  'evidenceRefs must contain only IDs present in the ContextManifest.',
  `ContextManifest checksum: ${sha256(context)}`,
  `ContextManifest:\n${context.contextText}`,
].join('\n\n');

async function synthesize() {
  const response = await fetch('http://127.0.0.1:8090/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 256, temperature: 0, top_p: 1, seed: 17, stream: false, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`ORNITH_SYNTHESIS_HTTP_${response.status}:${await response.text()}`);
  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) throw new Error('ORNITH_SYNTHESIS_EMPTY');
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || typeof parsed.summary !== 'string' || !Array.isArray(parsed.evidenceRefs) || typeof parsed.confidence !== 'number') throw new Error('ORNITH_SYNTHESIS_SCHEMA_INVALID');
  const allowed = new Set(context.evidenceRefs);
  if (parsed.evidenceRefs.some((ref) => !allowed.has(ref))) throw new Error('ORNITH_SYNTHESIS_UNGROUNDED_EVIDENCE');
  return parsed;
}

const first = await synthesize();
const second = await synthesize();
const firstChecksum = sha256(first);
const secondChecksum = sha256(second);
const report = {
  schema: 'atlas.ornith-external-evidence-synthesis-replay.v1',
  mode: 'READ_ONLY_ORNITH_CONTEXT_MANIFEST_SYNTHESIS_REPLAY',
  status: firstChecksum === secondChecksum ? 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY_PROVEN' : 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY_NON_IDENTICAL',
  model,
  contextManifestChecksum: sha256(context),
  contextCompilerSchema: context.schema,
  candidateOrdinals: context.candidateOrdinals,
  evidenceRefs: context.evidenceRefs,
  responseChecksums: { first: firstChecksum, second: secondChecksum, identical: firstChecksum === secondChecksum },
  grounded: true,
  controls: { rawRetrievalInjected: false, canonicalAuthority: false, mutationRequested: false, postgresWrites: false, qdrantWrites: false, valkeyWrites: false, neo4jWrites: false },
};
const reportPath = path.join(root, 'docs/reports/ornith-external-evidence-synthesis-replay-v1.json');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
if (report.status !== 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY_PROVEN') process.exitCode = 1;
