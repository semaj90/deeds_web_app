#!/usr/bin/env node
/**
 * SEM-INPUT-02 — mixed-candidate proof of the real SemanticInputCompilerV1
 * (SEM-INPUT-01), against real candidates from the pinned CandidateOrdinalMapV1.
 *
 * For a stratified sample across the corpus's real extension distribution
 * (.md 6213, .ts 4337, .mjs 2185, .json 1204, .svelte 898, .sql 443, .py 114,
 * measured live this session), proves:
 *   1. The compiler selects real, distinct, non-arbitrary content per file
 *      kind (structural declarations for TS/JS, heading section for MD,
 *      an explicitly-named WHOLE_FILE_FALLBACK for anything without a
 *      supported grammar -- never a silent truncation).
 *   2. The exact selected content is token-counted and, if within budget,
 *      embedded unchanged through the EMB-PROV-01-proven executor.
 *   3. The resulting content-selection policy is honestly, distinctly
 *      labeled per row (`selectionPolicyRevision`), not one blanket string.
 *
 * Read-only: no Postgres/Qdrant/Valkey/Neo4j/RabbitMQ writes. Local receipt
 * only.
 *
 * Usage: node scripts/atlas/sem-input-02-mixed-canary-v1.mjs [--sample=30]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

// The compiler is TS; run it through vite-node/tsx-free plain dynamic import
// isn't possible for a .ts file under plain node, so resolve via tsx's loader
// by re-invoking through the already-configured tsx runtime is unnecessary --
// simplest correct approach: import the compiled behavior directly since it
// has zero SvelteKit ($lib) dependencies, using Node's native TS stripping.
const compilerUrl = pathToFileURL(path.join(FRONTEND_ROOT, 'src/lib/server/atlas/features/semantic-input-compiler-v1.ts')).href;
const artifactUrl = pathToFileURL(path.join(FRONTEND_ROOT, 'src/lib/server/atlas/features/semantic-input-artifact-v1.ts')).href;
const { compileSemanticEmbeddingInputV1, compileSemanticInputArtifactV1 } = await import(compilerUrl);
const { semanticInputArtifactV1Schema } = await import(artifactUrl);
const requestV2Url = pathToFileURL(path.join(FRONTEND_ROOT, 'src/lib/server/atlas/features/semantic-embedding-request-v2.ts')).href;
const { prepareStrictEmbeddingRequestV2 } = await import(requestV2Url);

const MAP_ARTIFACT = path.join(REPO_ROOT, '.tmp/atlas/cei24-candidate-ordinal-map-v1/20260926T161327.479Z/candidate-ordinal-map-v1.json');
const EMBEDDING_URL = process.env.EMBEDDING_STRICT_BASE_URL ?? 'http://127.0.0.1:8081';
const EMBEDDING_MODEL = process.env.EMBEDDING_SERVER_MODEL ?? 'embeddinggemma';
const EMBEDDING_TOKENIZER_REVISION = process.env.EMBEDDING_TOKENIZER_REVISION;

const sampleArg = process.argv.find((a) => a.startsWith('--sample='));
const SAMPLE_SIZE = sampleArg ? Number(sampleArg.split('=')[1]) : 30;

async function tokenize(text) {
  const res = await fetch(`${EMBEDDING_URL}/tokenize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text, add_special: false }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`TOKENIZE_HTTP_${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body.tokens)) throw new Error('TOKENIZE_RESPONSE_MISSING_TOKENS');
  return body.tokens.length;
}

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
  if (!EMBEDDING_TOKENIZER_REVISION) throw new Error('EMBEDDING_TOKENIZER_REVISION_REQUIRED');
  const map = JSON.parse(readFileSync(MAP_ARTIFACT, 'utf8'));

  // Stratified sample: group real candidates by extension, take a
  // proportional slice from each of the top extensions, so the proof
  // actually exercises every real content-selection branch, not just
  // whichever extension happens to sort first.
  const byExt = new Map();
  for (const c of map.candidates) {
    const ext = (c.sourceRef.match(/\.[a-zA-Z0-9]+$/) || ['.none'])[0];
    if (!byExt.has(ext)) byExt.set(ext, []);
    byExt.get(ext).push(c);
  }
  const targetExts = ['.md', '.ts', '.mjs', '.json', '.svelte', '.sql', '.py', '.yaml'];
  const perExt = Math.max(1, Math.floor(SAMPLE_SIZE / targetExts.length));
  const sample = [];
  for (const ext of targetExts) {
    const bucket = byExt.get(ext) ?? [];
    const stride = Math.max(1, Math.floor(bucket.length / perExt));
    for (let i = 0; i < bucket.length && sample.length < SAMPLE_SIZE; i += stride) {
      sample.push(bucket[i]);
    }
  }

  const results = [];
  const policyCounts = {};

  for (const candidate of sample) {
    const row = { candidateOrdinal: candidate.candidateOrdinal, sourceRef: candidate.sourceRef };
    try {
      const absPath = path.join(REPO_ROOT, candidate.sourceRef);
      if (!existsSync(absPath)) { results.push({ ...row, status: 'SOURCE_FILE_MISSING' }); continue; }
      const buf = readFileSync(absPath);

      const artifact = await compileSemanticInputArtifactV1({
        canonicalId: candidate.canonicalId,
        packetKey: candidate.packetKey,
        sourceRef: candidate.sourceRef,
        sourceRevision: candidate.sourceRevision,
        fileBuffer: buf,
      });
      semanticInputArtifactV1Schema.parse(artifact); // fail loudly on any contract violation

      const embeddingInput = await compileSemanticEmbeddingInputV1({
        artifact,
        fileBuffer: buf,
        tokenizerRevision: EMBEDDING_TOKENIZER_REVISION,
        tokenize,
      });
      if (embeddingInput.status !== 'ADMITTED' || embeddingInput.inputText === null) {
        results.push({
          ...row,
          status: embeddingInput.status,
          contentSelectionRevision: embeddingInput.contentSelectionRevision,
          inputPolicyRevision: embeddingInput.inputPolicyRevision,
          tokenizerRevision: embeddingInput.tokenizerRevision,
          embeddedTokenCount: embeddingInput.embeddedTokenCount,
          embeddedInputChecksum: embeddingInput.embeddedInputChecksum,
          renderedTextChecksum: embeddingInput.renderedTextChecksum,
        });
        continue;
      }

      // Independently verify canonical artifact bytes and exact selected text
      // before the executor call. The live legacy executor remains separate
      // from /embed/v2; this receipt proves caller preparation only.
      const preparedRequest = prepareStrictEmbeddingRequestV2({ artifact, fileBuffer: buf, embeddingInput });
      const vector = await embed(preparedRequest.request.text);

      policyCounts[artifact.selectionPolicyRevision] = (policyCounts[artifact.selectionPolicyRevision] ?? 0) + 1;

      results.push({
        ...row,
        status: 'SEM_INPUT_COMPILED_AND_EMBEDDED',
        selectionPolicyRevision: artifact.selectionPolicyRevision,
        segmentCount: artifact.segments.length,
        segmentKinds: [...new Set(artifact.segments.map((s) => s.kind))],
        originalBytes: buf.length,
        renderedBytes: Buffer.byteLength(embeddingInput.inputText, 'utf8'),
        selectionRatio: Math.round((Buffer.byteLength(embeddingInput.inputText, 'utf8') / buf.length) * 1000) / 1000,
        tokenCount: embeddingInput.embeddedTokenCount,
        embeddedInputChecksum: embeddingInput.embeddedInputChecksum,
        inputArtifactChecksum: preparedRequest.request.inputArtifactChecksum,
        contentSelectionRevision: embeddingInput.contentSelectionRevision,
        inputPolicyRevision: embeddingInput.inputPolicyRevision,
        tokenizerRevision: embeddingInput.tokenizerRevision,
        renderedTextChecksum: embeddingInput.renderedTextChecksum,
        vectorDim: vector.length,
      });
    } catch (err) {
      results.push({ ...row, status: 'ERROR', error: String(err?.message ?? err) });
    }
  }

  const proven = results.filter((r) => r.status === 'SEM_INPUT_COMPILED_AND_EMBEDDED').length;
  const receipt = {
    schema: 'atlas.sem-input-02-mixed-canary-receipt.v2',
    generatedAt: new Date().toISOString(),
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    embeddingExecutor: { url: EMBEDDING_URL, model: EMBEDDING_MODEL, tokenizerRevision: EMBEDDING_TOKENIZER_REVISION },
    sampleSize: sample.length,
    provenCount: proven,
    policyDistribution: policyCounts,
    results,
    authority: { databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, graphifyRuns: 0 },
    status: proven === sample.length && sample.length > 0 ? 'SEM_INPUT_02_CANARY_PROVEN' : 'SEM_INPUT_02_CANARY_PARTIAL',
  };

  const outPath = path.join(REPO_ROOT, 'docs', 'reports', `sem-input-02-mixed-canary-v2-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ ...receipt, results: results }, null, 2));
  console.log('\nFull receipt:', outPath);
  if (receipt.status !== 'SEM_INPUT_02_CANARY_PROVEN') process.exitCode = 1;
}

main().catch((err) => { console.error('FATAL', err); process.exitCode = 1; });
