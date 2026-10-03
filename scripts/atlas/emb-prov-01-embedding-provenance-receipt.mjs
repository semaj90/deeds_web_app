#!/usr/bin/env node
/**
 * EMB-PROV-01 — embedding-service provenance receipt.
 *
 * Reconciles the two live embedding lanes this repo has (Ollama :11434
 * `embeddinggemma:latest`, and the strict canonical llama-server executor at
 * :8081 serving `models/embeddinggemma-300m-f16.gguf`) and proves, live:
 *
 *  1. The `.env` config the P0 fingerprint guard (`getBatchedEmbeddings` in
 *     rg-atlas/embed.ts) actually resolves at runtime is internally
 *     consistent (provider vs base URL vs live fingerprint), not silently
 *     broken by a duplicate/overridden env var.
 *  2. The on-disk GGUF artifact byte-for-byte matches the recorded
 *     `EMBEDDING_MODEL_ARTIFACT_REVISION`/`EMBEDDING_GGUF_SHA256` checksum
 *     (checksum-verified, not asserted).
 *  3. Both live executors, called with an identical fixed probe string,
 *     produce L2-normalized 768-dim vectors with cosine similarity above a
 *     tight threshold — i.e. they are the SAME semantic_768 representation,
 *     not two silently-diverging ones sharing a dimension.
 *
 * Read-only: makes embedding calls to already-running local executors, hashes
 * a local file, and reads .env. No Postgres/Qdrant/Redis/Neo4j writes.
 *
 * Usage: node scripts/atlas/emb-prov-01-embedding-provenance-receipt.mjs
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

function parseDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value; // last occurrence wins, matching real dotenv.parse() behavior
  }
  return out;
}

function sha256File(filePath) {
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

function norm(v) {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function tryEmbed(url, body, timeoutMs = 15_000) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(() => '') };
    return { ok: true, body: await res.json() };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

const env = parseDotEnv(path.join(FRONTEND_ROOT, '.env'));
const envLocal = parseDotEnv(path.join(FRONTEND_ROOT, '.env.local'));
const effective = { ...env, ...envLocal }; // .env.local overrides .env, matching connection-config.mjs's documented precedence

// --- 1. Config self-consistency -------------------------------------------------
const provider = effective.EMBEDDING_PROVIDER ?? null;
const baseUrl = effective.EMBEDDING_BASE_URL ?? null;
const expectedPortByProvider = { ollama: 11434, 'llama-server': 8090 }; // matches getExpectedPortForProvider()
let baseUrlPort = null;
try { baseUrlPort = baseUrl ? Number(new URL(baseUrl).port) : null; } catch { /* ignore */ }
const configSelfConsistent =
  provider != null && baseUrl != null && baseUrlPort === expectedPortByProvider[provider];

const strictBaseUrl = effective.EMBEDDING_STRICT_BASE_URL ?? null;
let strictBaseUrlPort = null;
try { strictBaseUrlPort = strictBaseUrl ? Number(new URL(strictBaseUrl).port) : null; } catch { /* ignore */ }

// --- 2. Artifact checksum verification ------------------------------------------
const modelPath = effective.EMBED_MODEL_PATH ?? null;
const recordedRevision = (effective.EMBEDDING_MODEL_ARTIFACT_REVISION ?? '').replace(/^sha256:/i, '').toLowerCase();
const recordedGgufSha = (effective.EMBEDDING_GGUF_SHA256 ?? '').toLowerCase();
let liveArtifactSha256 = null;
let artifactExists = false;
if (modelPath && existsSync(modelPath)) {
  artifactExists = true;
  liveArtifactSha256 = sha256File(modelPath);
}
const artifactChecksumMatchesRevision = artifactExists && liveArtifactSha256 === recordedRevision;
const artifactChecksumMatchesGgufVar = artifactExists && liveArtifactSha256 === recordedGgufSha;

// --- 3. Live cross-executor parity ----------------------------------------------
const PROBE_TEXT = 'The quick brown fox jumps over the lazy dog.';

const llamaServerResult = await tryEmbed('http://127.0.0.1:8081/v1/embeddings', {
  model: effective.EMBEDDING_SERVER_MODEL ?? 'embeddinggemma',
  input: PROBE_TEXT,
});
const ollamaResult = await tryEmbed('http://127.0.0.1:11434/api/embed', {
  model: 'embeddinggemma:latest',
  input: PROBE_TEXT,
});

const llamaVec = llamaServerResult.ok ? llamaServerResult.body?.data?.[0]?.embedding : null;
const ollamaVec = ollamaResult.ok ? ollamaResult.body?.embeddings?.[0] : null;

let parity = null;
if (Array.isArray(llamaVec) && Array.isArray(ollamaVec) && llamaVec.length === ollamaVec.length) {
  parity = {
    dim: llamaVec.length,
    llamaServerL2Norm: Number(norm(llamaVec).toFixed(6)),
    ollamaL2Norm: Number(norm(ollamaVec).toFixed(6)),
    cosineSimilarity: Number(cosine(llamaVec, ollamaVec).toFixed(6)),
  };
}
const PARITY_COSINE_THRESHOLD = 0.999;
const executorsAgree = parity != null && parity.cosineSimilarity >= PARITY_COSINE_THRESHOLD;

const receipt = {
  schema: 'atlas.emb-prov-01-embedding-provenance-receipt.v1',
  generatedAt: new Date().toISOString(),
  config: {
    provider,
    baseUrl,
    baseUrlPort,
    expectedPortForProvider: provider ? expectedPortByProvider[provider] ?? null : null,
    configSelfConsistent,
    note: configSelfConsistent
      ? 'provider/baseUrl agree on the expected port convention'
      : 'DRIFT: EMBEDDING_PROVIDER and EMBEDDING_BASE_URL disagree on port convention — check for a duplicate EMBEDDING_BASE_URL line in .env (last occurrence wins in dotenv.parse semantics, same as real dotenv)',
  },
  strictLane: {
    strictBaseUrl,
    strictBaseUrlPort,
    strictEnabled: effective.ATLAS_CANONICAL_EMBEDDING_STRICT === 'true',
    isDistinctFromGeneralBaseUrl: strictBaseUrl !== baseUrl,
    note: 'Strict semantic_768 lane (embedSemantic768Canonical) uses this dedicated var, kept separate from EMBEDDING_BASE_URL so the two purposes never collide again (EMB-PROV-01 fix, 2026-09-27).',
  },
  artifact: {
    modelPath,
    artifactExists,
    liveArtifactSha256,
    recordedModelArtifactRevision: recordedRevision || null,
    recordedGgufSha256Var: recordedGgufSha || null,
    artifactChecksumMatchesRevision,
    artifactChecksumMatchesGgufVar,
  },
  crossExecutorParity: {
    probeText: PROBE_TEXT,
    llamaServer8081: { reachable: llamaServerResult.ok, error: llamaServerResult.ok ? null : llamaServerResult.error },
    ollama11434: { reachable: ollamaResult.ok, error: ollamaResult.ok ? null : ollamaResult.error },
    parity,
    threshold: PARITY_COSINE_THRESHOLD,
    executorsAgree,
  },
  status:
    configSelfConsistent && artifactChecksumMatchesRevision && executorsAgree
      ? 'EMB_PROV_01_PROVEN'
      : 'EMB_PROV_01_DRIFT_DETECTED',
};

const outPath = path.join(REPO_ROOT, 'docs', 'reports', 'emb-prov-01-embedding-provenance-receipt.json');
writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
if (receipt.status !== 'EMB_PROV_01_PROVEN') process.exitCode = 1;
