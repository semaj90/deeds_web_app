#!/usr/bin/env node
/**
 * ACE-V4-COMP-01 canary — the first real V4 packets this repo has ever produced.
 *
 * Builds on ORDINAL-VECTOR-01-CANARY: takes the already-sealed, existing V3
 * packets for the same 8 candidates (found on disk, `semantic.embedding.status:
 * "PENDING"`, `vector_ref: null` -- never embedded, NOT the older 3,270/3,294
 * drifted corpus), upgrades ONLY their embedding section to CURRENT using the
 * freshly-verified vector from the canary run, re-seals via the real
 * `buildAcePacketV3` (recomputes the packet checksum -- every other section is
 * untouched, reused byte-for-byte from the stored packet), then wraps each in
 * `buildAcePacketV4` bound to the pinned CandidateOrdinalMapV1 coordinates.
 *
 * This does NOT "re-point old V3 vector references by packet key alone" (the
 * thing ACE-PACKET-ORDINAL-BINDING-01 explicitly forbids) -- these packets had
 * NO vector reference to re-point; this is a first-time fill using a
 * freshly-computed, content-hash-verified embedding for the exact same
 * source_revision the stored packet already carries.
 *
 * Read-only: no Postgres/Qdrant/Valkey/Neo4j/RabbitMQ writes. Reads the sealed
 * V3 packets from disk, calls the same live embedding executor
 * ORDINAL-VECTOR-01-CANARY proved, and writes only a local receipt JSON.
 *
 * Usage: node scripts/atlas/ace-v4-comp-01-canary-v1.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const PARENT_ATLAS_DIST = path.join(REPO_ROOT, 'packages', 'parent-atlas', 'dist', 'core');

for (const envFile of ['.env', '.env.local']) {
  const envPath = path.join(FRONTEND_ROOT, envFile);
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const { buildAcePacketV3, verifyAcePacketV3 } = await import(pathToFileURL(path.join(PARENT_ATLAS_DIST, 'ace-packet-v3.js')).href);
const { buildAcePacketV4, verifyAcePacketV4 } = await import(pathToFileURL(path.join(PARENT_ATLAS_DIST, 'ace-packet-v4.js')).href);

const MAP_ARTIFACT = path.join(REPO_ROOT, '.tmp/atlas/cei24-candidate-ordinal-map-v1/20260926T161327.479Z/candidate-ordinal-map-v1.json');
const V3_SHARD = path.join(REPO_ROOT, '.tmp/atlas/ace-packets-v3/20260925T220337Z/ace-packets-v3-00001.ndjson');
const EMBEDDING_URL = process.env.EMBEDDING_STRICT_BASE_URL ?? 'http://127.0.0.1:8081';
const EMBEDDING_MODEL = process.env.EMBEDDING_SERVER_MODEL ?? 'embeddinggemma';
const MODEL_REVISION = (process.env.EMBEDDING_MODEL_ARTIFACT_REVISION ?? '').trim();
const MAX_EMBED_CHARS = 4000;

function sha256Buf(buf) { return 'sha256:' + createHash('sha256').update(buf).digest('hex'); }
function sha256Vec(vec) { return 'sha256:' + createHash('sha256').update(Buffer.from(new Float32Array(vec).buffer)).digest('hex'); }
function sha256Text(text) { return sha256Buf(Buffer.from(text, 'utf8')); }

async function embed(text) {
  const res = await fetch(`${EMBEDDING_URL}/v1/embeddings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`EMBED_HTTP_${res.status}`);
  const body = await res.json();
  const vec = body.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== 768) throw new Error(`EMBED_BAD_SHAPE:${vec?.length}`);
  return vec;
}

async function main() {
  const map = JSON.parse(readFileSync(MAP_ARTIFACT, 'utf8'));
  const shardLines = readFileSync(V3_SHARD, 'utf8').split('\n').filter(Boolean);
  const v3ByPacketKey = new Map();
  for (const line of shardLines) {
    const p = JSON.parse(line);
    v3ByPacketKey.set(p.identity.packet_key, p);
  }

  const sample = map.candidates.slice(0, 8);
  const results = [];

  for (const candidate of sample) {
    const row = { candidateOrdinal: candidate.candidateOrdinal, packetKey: candidate.packetKey, sourceRef: candidate.sourceRef };
    try {
      const storedV3 = v3ByPacketKey.get(candidate.packetKey);
      if (!storedV3) { results.push({ ...row, status: 'NO_STORED_V3_PACKET' }); continue; }

      // Verify the stored packet is genuinely sealed/valid BEFORE touching it.
      const verifiedOriginal = verifyAcePacketV3(storedV3);
      if (verifiedOriginal.semantic.data.embedding.data.vector_ref !== null) {
        results.push({ ...row, status: 'ALREADY_HAS_VECTOR_REF_SKIPPING_TO_AVOID_REPOINTING' });
        continue;
      }
      if (verifiedOriginal.identity.workspace_revision !== map.workspaceRevision ||
          verifiedOriginal.identity.source_revision !== candidate.sourceRevision) {
        results.push({ ...row, status: 'STORED_V3_REVISION_MISMATCH_WITH_CURRENT_MAP' });
        continue;
      }

      const absSourcePath = path.join(REPO_ROOT, candidate.sourceRef);
      if (!existsSync(absSourcePath)) { results.push({ ...row, status: 'SOURCE_FILE_MISSING' }); continue; }
      const buf = readFileSync(absSourcePath);
      const liveSourceRevision = sha256Buf(buf);
      if (liveSourceRevision !== candidate.sourceRevision) {
        results.push({ ...row, status: 'SOURCE_REVISION_MISMATCH', liveSourceRevision });
        continue;
      }

      const text = buf.toString('utf8');
      const embedInput = text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;
      const vector = await embed(embedInput);
      const inputDigest = sha256Text(embedInput);
      const embeddingDigest = sha256Vec(vector);

      // Reuse every existing section byte-for-byte; only upgrade the embedding
      // section (PENDING -> CURRENT) and set identity.representation_revision
      // (required by V3's own refine() rule for a CURRENT embedding).
      const { integrity: _origIntegrity, ...origBody } = verifiedOriginal;
      const newV3Input = {
        ...origBody,
        identity: { ...origBody.identity, representation_revision: MODEL_REVISION || 'UNSET' },
        semantic: {
          ...origBody.semantic,
          data: {
            ...origBody.semantic.data,
            embedding: {
              status: 'CURRENT',
              revision: MODEL_REVISION || 'UNSET',
              evidence_refs: [`ordinal-vector-01-canary:${candidate.canonicalId}`],
              data: {
                model: EMBEDDING_MODEL,
                dimension: 768,
                input_digest: inputDigest,
                embedding_digest: embeddingDigest,
                vector_ref: { kind: 'CANDIDATE_ORDINAL', value: String(candidate.candidateOrdinal) },
              },
            },
          },
        },
      };
      const newV3 = buildAcePacketV3(newV3Input);

      const v4 = buildAcePacketV4({
        packet: newV3,
        coordinates: {
          candidateOrdinal: candidate.candidateOrdinal,
          canonicalId: candidate.canonicalId,
          packetKey: candidate.packetKey,
          sourceRef: candidate.sourceRef,
          sourceRevision: candidate.sourceRevision,
          workspaceRevision: candidate.workspaceRevision,
          candidateSnapshotRevision: map.candidateSnapshotRevision,
          ordinalMapChecksum: map.ordinalMapChecksum,
        },
      });

      // Round-trip: re-verify from a JSON-serialized copy, same as a real reader would.
      const reverified = verifyAcePacketV4(JSON.parse(JSON.stringify(v4)));

      results.push({
        ...row,
        status: 'V4_PACKET_BUILT_AND_VERIFIED',
        v3PacketChecksum: newV3.integrity.packet_checksum,
        v4EnvelopeChecksum: v4.integrity.envelopeChecksum,
        embeddingDigest,
        vectorRef: newV3.semantic.data.embedding.data.vector_ref,
        roundTripOk: reverified.integrity.envelopeChecksum === v4.integrity.envelopeChecksum,
      });
    } catch (err) {
      results.push({ ...row, status: 'ERROR', error: String(err?.message ?? err) });
    }
  }

  const proven = results.filter((r) => r.status === 'V4_PACKET_BUILT_AND_VERIFIED').length;
  const receipt = {
    schema: 'atlas.ace-v4-comp-01-canary-receipt.v1',
    generatedAt: new Date().toISOString(),
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    v3ShardSource: V3_SHARD,
    embeddingExecutor: { url: EMBEDDING_URL, model: EMBEDDING_MODEL, modelRevision: MODEL_REVISION || null },
    sampleSize: sample.length,
    provenCount: proven,
    results,
    authority: { databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, graphifyRuns: 0 },
    status: proven === sample.length && sample.length > 0 ? 'ACE_V4_COMP_01_CANARY_PROVEN' : 'ACE_V4_COMP_01_CANARY_PARTIAL',
    scope: 'Proves the composer pattern (V3-embedding-fill + V4-wrap) is sound on real stored packets. Does NOT scale to the full 16,151-row corpus, does not decide a production content-selection/chunking policy, and produces no admitted/persisted artifact -- new V3/V4 bytes exist only in this receipt and process memory, matching the read-only convention of every prior gate in this thread.',
  };

  const outPath = path.join(REPO_ROOT, 'docs', 'reports', `ace-v4-comp-01-canary-v1-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ ...receipt, results: results.slice(0, 3), _fullReceipt: outPath }, null, 2));
  if (receipt.status !== 'ACE_V4_COMP_01_CANARY_PROVEN') process.exitCode = 1;
}

main().catch((err) => { console.error('FATAL', err); process.exitCode = 1; });
