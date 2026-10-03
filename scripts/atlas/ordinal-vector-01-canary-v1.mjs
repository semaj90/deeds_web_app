#!/usr/bin/env node
/**
 * ORDINAL-VECTOR-01 canary — proves the full chain, for real candidates, read-only:
 *
 *   packetKey <-> canonicalId <-> candidateOrdinal <-> ordinalMapChecksum <-> exact vector bytes
 *
 * Picks up exactly where `parent-atlas-repair-candidate-feature-matrix/tasks.md`'s
 * `ORDINAL-POLICY-01` (2026-09-27) left off: the current, checksum-verified
 * `CandidateOrdinalMapV1` (16,151 rows, identity fully proven) has
 * `semanticRevision: null` and `representationBindings: []` on every row — the
 * "exact vector bytes" half of the chain has never been produced. This does
 * NOT re-derive identity (already proven); it proves the missing vector half
 * on a small, explicit sample.
 *
 * For each sampled candidate:
 *   1. Loads the row from the pinned, checksum-verified map artifact.
 *   2. Re-hashes the real on-disk file at `sourceRef` and requires it to equal
 *      the map's recorded `sourceRevision` byte-for-byte (fails closed, does
 *      not embed on a mismatch — a stale/moved file must not silently bind a
 *      vector to the wrong content).
 *   3. Embeds the (possibly truncated, explicitly recorded) file content via
 *      the EMB-PROV-01-proven strict semantic_768 executor (llama-server
 *      :8081 by default, matching EMBEDDING_STRICT_BASE_URL).
 *   4. Constructs a `candidateRepresentationBindingV1` for `semantic_768` and
 *      validates it against the real Zod schema + `assertRepresentationBindingSet`.
 *   5. Hashes the exact embedding bytes (Float32Array LE) so the vector itself
 *      is checksum-addressable, not just "an embedding happened."
 *
 * Read-only: no Postgres/Qdrant/Valkey/Neo4j/RabbitMQ writes. Writes only a
 * local receipt JSON, matching every other receipt in this thread's authority
 * counters (all zero).
 *
 * Usage: cd sveltekit-frontend && node ../scripts/atlas/ordinal-vector-01-canary-v1.mjs [--limit=10]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const require = createRequire(path.join(FRONTEND_ROOT, 'package.json'));

// This is a plain node script (no SvelteKit/vite-node auto-dotenv). Load .env
// then .env.local (override), matching connection-config.mjs's documented
// precedence, without clobbering an explicitly pre-set process.env var.
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
    process.env[key] = value; // last-occurrence-wins per file, .env.local overrides .env
  }
}

const MAP_ARTIFACT = path.join(
  REPO_ROOT,
  '.tmp/atlas/cei24-candidate-ordinal-map-v1/20260926T161327.479Z/candidate-ordinal-map-v1.json',
);
const EMBEDDING_URL = process.env.EMBEDDING_STRICT_BASE_URL ?? 'http://127.0.0.1:8081';
const EMBEDDING_MODEL = process.env.EMBEDDING_SERVER_MODEL ?? 'embeddinggemma';
const MODEL_REVISION = (process.env.EMBEDDING_MODEL_ARTIFACT_REVISION ?? '').trim();
const MAX_EMBED_CHARS = 4000; // stays well within EMBED_CTX=2048 tokens for the canary

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 10;

function sha256Buf(buf) {
  return 'sha256:' + createHash('sha256').update(buf).digest('hex');
}
function sha256VectorBytes(vec) {
  const f32 = new Float32Array(vec);
  return 'sha256:' + createHash('sha256').update(Buffer.from(f32.buffer)).digest('hex');
}

async function embed(text) {
  const res = await fetch(`${EMBEDDING_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`EMBED_HTTP_${res.status}:${await res.text().catch(() => '')}`);
  const body = await res.json();
  const vec = body.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== 768) throw new Error(`EMBED_BAD_SHAPE:${vec?.length}`);
  return vec;
}

async function main() {
  if (!existsSync(MAP_ARTIFACT)) throw new Error(`CANDIDATE_ORDINAL_MAP_ARTIFACT_MISSING:${MAP_ARTIFACT}`);

  const {
    candidateOrdinalMapV1Schema,
    candidateRepresentationBindingV1Schema,
    assertRepresentationBindingSet,
    assertCandidateOrdinalMapIntegrityV1,
    canonicalCandidateV1Schema,
  } = require(path.join(FRONTEND_ROOT, 'src/lib/server/atlas/features/canonical-candidate-v1.ts'));

  const raw = JSON.parse(readFileSync(MAP_ARTIFACT, 'utf8'));
  const map = candidateOrdinalMapV1Schema.parse(raw);
  // Re-verify the WHOLE map's integrity (row count, dense ordinals, revision
  // consistency, checksum) before trusting any single row from it -- this is
  // the same gate every real consumer of this artifact must pass.
  assertCandidateOrdinalMapIntegrityV1(map);

  const sample = map.candidates.slice(0, LIMIT);
  const results = [];

  for (const candidate of sample) {
    const row = { candidateOrdinal: candidate.candidateOrdinal, canonicalId: candidate.canonicalId, packetKey: candidate.packetKey, sourceRef: candidate.sourceRef };
    try {
      // sourceRef is repo-root-relative (verified against the map artifact), not
      // relative to this script's process.cwd() (which may be sveltekit-frontend/).
      const absSourcePath = path.join(REPO_ROOT, candidate.sourceRef);
      if (!candidate.sourceRef || !existsSync(absSourcePath)) {
        results.push({ ...row, status: 'SOURCE_FILE_MISSING' });
        continue;
      }
      const buf = readFileSync(absSourcePath);
      const liveSourceRevision = sha256Buf(buf);
      if (liveSourceRevision !== candidate.sourceRevision) {
        results.push({
          ...row,
          status: 'SOURCE_REVISION_MISMATCH',
          recordedSourceRevision: candidate.sourceRevision,
          liveSourceRevision,
        });
        continue; // fail closed: never embed content that doesn't match the pinned revision
      }

      const text = buf.toString('utf8');
      const truncated = text.length > MAX_EMBED_CHARS;
      const embedInput = truncated ? text.slice(0, MAX_EMBED_CHARS) : text;
      const vector = await embed(embedInput);
      const vectorChecksum = sha256VectorBytes(vector);

      const binding = candidateRepresentationBindingV1Schema.parse({
        representationId: 'semantic_768',
        family: 'EMBEDDINGGEMMA_MRL',
        dimensions: 768,
        modelRevision: MODEL_REVISION || 'UNSET',
        projectionKind: 'NONE',
        sourceRepresentationId: null,
        projectionRevision: null,
        normalized: true,
        available: true,
        availabilityReason: null,
      });
      assertRepresentationBindingSet([binding]);

      // Prove the fully-bound candidate re-validates end to end against the
      // real canonical schema (identity + representation binding together).
      const boundCandidate = canonicalCandidateV1Schema.parse({
        ...candidate,
        semanticRevision: MODEL_REVISION || 'UNSET',
        representationBindings: [binding],
      });

      results.push({
        ...row,
        status: 'VECTOR_BOUND_PROVEN',
        liveSourceRevision,
        contentLength: text.length,
        embeddedLength: embedInput.length,
        truncated,
        vectorDim: vector.length,
        vectorChecksum,
        modelRevision: binding.modelRevision,
        boundCandidateValid: boundCandidate.representationBindings.length === 1,
      });
    } catch (err) {
      results.push({ ...row, status: 'ERROR', error: String(err?.message ?? err) });
    }
  }

  const proven = results.filter((r) => r.status === 'VECTOR_BOUND_PROVEN').length;
  const receipt = {
    schema: 'atlas.ordinal-vector-01-canary-receipt.v1',
    generatedAt: new Date().toISOString(),
    mapArtifact: MAP_ARTIFACT,
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    mapRowCount: map.rowCount,
    mapIntegrityVerified: true,
    embeddingExecutor: { url: EMBEDDING_URL, model: EMBEDDING_MODEL, modelRevision: MODEL_REVISION || null },
    sampleSize: sample.length,
    provenCount: proven,
    results,
    authority: {
      identityAuthority: false,
      canonicalAuthority: false,
      databaseWrites: 0,
      qdrantWrites: 0,
      valkeyWrites: 0,
      rabbitmqPublishes: 0,
      graphifyRuns: 0,
    },
    status: proven === sample.length && sample.length > 0 ? 'ORDINAL_VECTOR_01_CANARY_PROVEN' : 'ORDINAL_VECTOR_01_CANARY_PARTIAL',
    nextGate: 'ACE-V4-COMP-01: scale this exact bound-representation pattern to the full 16,151-row map (chunked, batched embedding calls), then build the V4 composer against the now-provable packetKey->vector-bytes mapping.',
  };

  const outPath = path.join(REPO_ROOT, 'docs', 'reports', `ordinal-vector-01-canary-v1-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ ...receipt, results: results.slice(0, 3), _fullReceipt: outPath }, null, 2));
  if (receipt.status !== 'ORDINAL_VECTOR_01_CANARY_PROVEN') process.exitCode = 1;
}

main().catch((err) => { console.error('FATAL', err); process.exitCode = 1; });
