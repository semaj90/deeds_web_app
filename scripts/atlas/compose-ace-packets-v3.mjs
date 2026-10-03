#!/usr/bin/env node

/**
 * Composes atlas.ace-packet.v3 packets from the sealed enriched-index shards + CandidateFeatureMatrix draft.
 * Local artifacts only: no PostgreSQL / Valkey / Qdrant writes, no model calls. Every packet is verified
 * (schema + checksum) and round-tripped through cache admission before the run is sealed.
 *
 * Only REVISION_QUALIFIED rows can be composed (identity.source_revision is mandatory). Sections whose
 * inputs are unqualified are HINT/PENDING, never CURRENT: no representation_revision, SOM revision or
 * input-bound embedding digest exists yet, so semantic/topology cannot be CURRENT in this run.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './connection-config.mjs';

const dist = (f) => pathToFileURL(path.join(REPO_ROOT, 'packages/parent-atlas/dist/core', f)).href;
const { buildAcePacketV3, verifyAcePacketV3 } = await import(dist('ace-packet-v3.js'));
const { admitCachedAcePacketV3 } = await import(dist('ace-packet-v3-admission.js'));

const PRODUCER = 'compose-ace-packets-v3@1';
const shardRoot = path.join(REPO_ROOT, '.tmp/atlas/current-enriched-index-shards-v1');
const dir = process.argv[2] ?? fs.readdirSync(shardRoot).sort().at(-1);
const manifestIn = JSON.parse(fs.readFileSync(path.join(shardRoot, dir, 'manifest.json'), 'utf8'));
const matrixRoot = path.join(REPO_ROOT, '.tmp/atlas/candidate-feature-matrix-v1');
const mdir = path.join(matrixRoot, fs.readdirSync(matrixRoot).sort().at(-1));
const matrix = JSON.parse(fs.readFileSync(path.join(mdir, 'descriptor.json'), 'utf8'));
const embMask = fs.readFileSync(path.join(mdir, 'semantic768_mask.u8'));
const ordinalOf = new Map();
fs.readFileSync(path.join(mdir, 'candidate-ordinal-map.ndjson'), 'utf8').split('\n').filter(Boolean).forEach((l) => { const r = JSON.parse(l); ordinalOf.set(r.packetKey, r.candidateOrdinal); });

const asSha = (hex) => `sha256:${String(hex).replace(/^sha256:/, '')}`;
const section = (data, status, revision, evidence_refs = []) => ({ status, revision, evidence_refs, data });
const sourceRevisionOf = (r) => r.sourceRevision;

function compose(r) {
  const ord = ordinalOf.get(r.packetKey);
  const realVector = ord !== undefined && embMask[ord] === 1;
  const inputDigest = `sha256:${crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex')}`;
  return buildAcePacketV3({
    base: { packet_revision: inputDigest, producer_revision: PRODUCER, hypergraph: null, envelope: { packet_key: r.packetKey, source_ref: r.sourceRef, canonical_source_ref: r.sourceRef, feature_id: null, source_revision: sourceRevisionOf(r) } },
    identity: { packet_key: r.packetKey, source_ref: r.sourceRef, workspace_revision: r.workspaceRevision, source_revision: sourceRevisionOf(r), packet_revision: inputDigest, producer_revision: PRODUCER, representation_id: 'semantic_768', representation_revision: null, feature_revision: null, graph_revision: null, symbol_version_id: null, tree_node_id: null },
    source: section({ language: r.language ?? null, source_digest: asSha(r.sourceContentHash), start_byte: null, end_byte: null, ast_state: r.astState }, 'CURRENT', sourceRevisionOf(r), ['graphify_execution_file_membership_v2']),
    semantic: section({
      summary: section({ text: null, input_digest: null, model_revision: null }, r.summary.present ? 'HINT' : 'PENDING', null),
      embedding: section({ model: null, dimension: realVector ? 768 : null, input_digest: null, embedding_digest: null, vector_ref: realVector ? { kind: 'CANDIDATE_ORDINAL', value: String(ord) } : null }, realVector ? 'HINT' : 'PENDING', null),
      keywords: [], entities: [], concept_ids: [], domain_class: r.domainClass ?? null,
    }, 'HINT', null),
    topology: section({ community_id: r.communityId === null || r.communityId === undefined ? null : String(r.communityId), pagerank: r.pagerank ?? null, som: r.somCell ? { row: r.somCell[0], col: r.somCell[1] } : null, kmeans_cluster: r.clusterId === null || r.clusterId === undefined ? null : String(r.clusterId), centroid_refs: [] }, 'HINT', null),
    residency: section({ tier: 'COLD', lod: 'IDENTITY', utility: null, prefetch_reasons: [], cache_identity_checksum: null }, 'PENDING', null),
    evidence: section({ refs: r.evidenceRefs ?? [], contradictions: [], stale_refs: [] }, 'CURRENT', sourceRevisionOf(r)),
  });
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(REPO_ROOT, '.tmp/atlas/ace-packets-v3', stamp); fs.mkdirSync(outDir, { recursive: true });
const shards = []; const tally = {}; const bump = (k) => { tally[k] = (tally[k] ?? 0) + 1; };
let composed = 0; let skipped = 0; let verifyFail = 0; let admissionMiss = 0; let buf = []; let idx = 0;
const flush = () => { if (!buf.length) return; idx += 1; const name = `ace-packets-v3-${String(idx).padStart(5, '0')}.ndjson`; const body = buf.join('\n') + '\n'; fs.writeFileSync(path.join(outDir, name), body, { flag: 'wx' }); shards.push({ path: name, records: buf.length, sha256: crypto.createHash('sha256').update(body).digest('hex') }); buf = []; };
for (const s of manifestIn.shards) {
  for (const line of fs.readFileSync(path.join(shardRoot, dir, s.path), 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.lineageState !== 'REVISION_QUALIFIED') { skipped += 1; continue; }
    const p = compose(r);
    const raw = JSON.stringify(p);
    try { verifyAcePacketV3(JSON.parse(raw)); } catch { verifyFail += 1; }
    const d = admitCachedAcePacketV3(raw, { packet_key: p.identity.packet_key, source_revision: p.identity.source_revision, workspace_revision: p.identity.workspace_revision, representation_id: 'semantic_768', representation_revision: null, packet_checksum: p.integrity.packet_checksum });
    if (d.decision !== 'HIT') admissionMiss += 1;
    for (const k of ['source', 'semantic', 'topology', 'residency', 'evidence']) bump(`${k}:${p[k].status}`);
    bump(`embedding:${p.semantic.data.embedding.status}`); bump(`summary:${p.semantic.data.summary.status}`);
    buf.push(raw); composed += 1; if (buf.length >= 5000) flush();
  }
}
flush();
const rootSha256 = crypto.createHash('sha256').update(shards.map((s) => `${s.path}:${s.sha256}`).join('\n')).digest('hex');
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ schema: 'atlas.ace-packets-v3-manifest.v1', producer: PRODUCER, records: composed, shards, rootSha256, sourceShards: { dir: path.relative(REPO_ROOT, path.join(shardRoot, dir)), rootSha256: manifestIn.rootSha256 }, matrix: { dir: path.relative(REPO_ROOT, mdir), ordinalMapChecksum: matrix.ordinalMapChecksum } }, null, 2) + '\n', { flag: 'wx' });
const receipt = {
  schema: 'atlas.ace-packets-v3-composition.v1', mode: 'LOCAL_ARTIFACTS_ONLY', databaseWrites: 0, valkeyWrites: 0, qdrantWrites: 0, llmCalls: 0,
  composed, skippedNotRevisionQualified: skipped, verifyFailures: verifyFail, cacheAdmissionMisses: admissionMiss,
  sectionStatus: Object.fromEntries(Object.entries(tally).sort()),
  currentSemanticOrTopology: 0,
  whyNotCurrent: ['representation_revision does not exist (legacy 0), so no embedding can be CURRENT', 'som_revision absent, so topology stays HINT', 'summary text is not admitted (no input digest; July summaries are scaffold-contaminated)', 'residency has not been computed (PENDING)', 'no hypergraph relationship evidence attached (base.hypergraph = null)'],
  manifest: path.relative(REPO_ROOT, path.join(outDir, 'manifest.json')), rootSha256, generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/ace-packets-v3-composition-v1.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
process.exit(verifyFail || admissionMiss ? 1 : 0);
