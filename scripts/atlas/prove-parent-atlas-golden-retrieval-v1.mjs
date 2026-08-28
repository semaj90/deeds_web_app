#!/usr/bin/env node

/** Read-only Workstation V1 golden retrieval replay. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = path.resolve(process.env.ATLAS_GOLDEN_RETRIEVAL_REPORT ?? path.join(ROOT, 'docs/reports/parent-atlas-golden-retrieval-v1.json'));
const embeddingUrl = String(process.env.EMBED_SERVICE_URL ?? process.env.EMBEDDING_BASE_URL ?? 'http://127.0.0.1:8097').replace(/\/+$/, '');
const qdrantUrl = String(process.env.QDRANT_URL ?? `http://${process.env.QDRANT_HOST ?? '127.0.0.1'}:${process.env.QDRANT_PORT ?? '6333'}`).replace(/\/+$/, '');
const collection = String(process.env.ATLAS_QDRANT_COLLECTION ?? 'codebase_chunks_768');
const model = String(process.env.EMBEDDINGGEMMA_MODEL ?? process.env.EMBEDDING_GEMMA_MODEL ?? 'embeddinggemma:latest');
const queryText = String(process.env.ATLAS_GOLDEN_QUERY ?? 'Parent Atlas semantic retrieval lineage canary');
const sha256 = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

async function embedQuery() {
  const response = await fetch(`${embeddingUrl}/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts: [queryText], model }), signal: AbortSignal.timeout(120_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`EMBED_HTTP_${response.status}:${JSON.stringify(body).slice(0, 300)}`);
  const vector = body.embeddings?.[0];
  if (!Array.isArray(vector) || vector.length !== 768 || vector.some((value) => !Number.isFinite(value))) throw new Error('SEMANTIC_768_QUERY_DIMENSION_OR_FINITE_FAILED');
  return vector;
}

async function exactSearch(vector, packetKeys) {
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: vector, using: 'content', filter: { must: [{ key: 'packet_key', match: { any: packetKeys } }, { key: 'representation_id', match: { value: 'semantic_768' } }, { key: 'embedding_dimension', match: { value: 768 } }] }, params: { exact: true }, limit: Math.min(768, packetKeys.length), with_payload: true, with_vector: false }), signal: AbortSignal.timeout(120_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`QDRANT_EXACT_QUERY_HTTP_${response.status}:${JSON.stringify(body).slice(0, 400)}`);
  return Array.isArray(body?.result?.points) ? body.result.points : [];
}

function normalizeHits(points, byPacketKey) {
  return points.map((point) => {
    const payload = point.payload ?? {};
    const candidate = byPacketKey.get(String(payload.packet_key ?? ''));
    if (!candidate) throw new Error(`QDRANT_HIT_OUTSIDE_CANDIDATE_MAP:${String(payload.packet_key ?? point.id)}`);
    return { candidateOrdinal: candidate.candidateOrdinal, canonicalId: candidate.canonicalId, packetKey: candidate.packetKey, sourceRef: candidate.sourceRef, score: Number(point.score), pointId: String(point.id) };
  }).sort((a, b) => b.score - a.score || a.candidateOrdinal - b.candidateOrdinal);
}

async function main() {
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(map.candidates) ? map.candidates : [];
  if (!candidates.length || candidates.length > 768) throw new Error('GOLDEN_RETRIEVAL_CANDIDATE_POOL_INVALID');
  if (candidates.some((candidate) => candidate.semanticRevision === null || candidate.representationBindings?.some((binding) => binding.representationId === 'semantic_768' && binding.available !== true) !== false)) throw new Error('GOLDEN_RETRIEVAL_SEMANTIC_BINDING_INCOMPLETE');
  const packetKeys = candidates.map((candidate) => candidate.packetKey).filter(Boolean);
  const byPacketKey = new Map(candidates.map((candidate) => [candidate.packetKey, candidate]));
  const vector = await embedQuery();
  const first = normalizeHits(await exactSearch(vector, packetKeys), byPacketKey);
  const second = normalizeHits(await exactSearch(vector, packetKeys), byPacketKey);
  const normalized = (hits) => hits.map(({ candidateOrdinal, canonicalId, packetKey, sourceRef, score }) => ({ candidateOrdinal, canonicalId, packetKey, sourceRef, score }));
  const firstChecksum = sha256(JSON.stringify(normalized(first)));
  const secondChecksum = sha256(JSON.stringify(normalized(second)));
  const topK = Math.min(32, candidates.length);
  const manifest = { schema: 'atlas.context-manifest.v1', queryText, candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, workspaceRevision: map.workspaceRevision, semanticRevision: [...new Set(candidates.map((candidate) => candidate.semanticRevision))][0], representationId: 'semantic_768', vectorName: 'content', candidatePoolLimit: 768, actualCandidateCount: candidates.length, topK, candidates: normalized(first).slice(0, topK), graphRevision: null, graphFeaturesPresent: false, cacheMode: 'BYPASS', neuralShortlist: 'DISABLED', canonicalAuthority: false };
  const report = { schema: 'atlas.parent-atlas-golden-retrieval.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY_EXACT_REPLAY', query: { text: queryText, embeddingEndpoint: embeddingUrl, model, dimensions: vector.length }, qdrant: { url: qdrantUrl, collection, vectorName: 'content', params: { exact: true }, candidateFilterCount: packetKeys.length, hitsFirst: first.length, hitsSecond: second.length }, candidateMap: { candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, workspaceRevision: map.workspaceRevision, rowCount: candidates.length }, replay: { firstChecksum, secondChecksum, identical: firstChecksum === secondChecksum }, contextManifest: { checksum: sha256(JSON.stringify(manifest)), topK: manifest.topK, candidateCount: manifest.candidates.length }, ranking: { exactSemantic768: true, neuralShortlist: false, rrf: false, topologyVote: false, tieBreak: 'candidateOrdinal ASC' }, writes: { postgresWrites: false, qdrantWrites: false, redisWrites: false, neo4jWrites: false }, status: first.length > 0 && firstChecksum === secondChecksum ? 'GOLDEN_RETRIEVAL_REPLAY_PROVEN' : 'GOLDEN_RETRIEVAL_REPLAY_BLOCKED', nextGate: first.length > 0 && firstChecksum === secondChecksum ? 'CONTEXT_MANIFEST_READ_ONLY_REPLAY' : 'QDRANT_EXACT_CANDIDATE_PROJECTION_RECONCILIATION', manifest, hits: normalized(first) };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, hits: first.length, replayIdentical: report.replay.identical, contextManifestChecksum: report.contextManifest.checksum, reportPath }, null, 2));
  if (report.status !== 'GOLDEN_RETRIEVAL_REPLAY_PROVEN') process.exitCode = 1;
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
