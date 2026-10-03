#!/usr/bin/env node
// ANALYSIS-PGVECTOR-ORACLE-01a: bounded, DB-free embedding fixture for OpenSpec EvidenceCards.
// Embeds N cards (default 10) through the already-resident Ollama `embeddinggemma:latest`
// executor (EMB-PROV-01 proved it agrees with the receipt-bound GGUF, cosine 0.999988), then
// runs a CPU exact cosine top-k as the reference. Writes only under --out (gitignored .tmp).
// No Postgres / Qdrant / Valkey / cuVS / GPU job is started; Ollama is only called, not launched.
//
//   node scripts/atlas/openspec-card-embedding-fixture-v1.mjs [--count 10] [--k 3]
//        [--out .tmp/atlas/openspec-embed-fixture] [--dry-run]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE_SCHEMA = 'atlas.openspec-card-embedding-fixture.v1';
const sha256 = (data) => `sha256:${createHash('sha256').update(data).digest('hex')}`;

/** Deterministic cohort: first two changes (sorted) that have >= perChange cards, perChange each. */
export function selectCohort(cards, count = 10, perChange = 5) {
  const byChange = new Map();
  for (const card of cards) {
    const id = card.taskIdentity?.changeId;
    if (!id || !card.contextBlob || card.taskIdentity?.identityState === 'AMBIGUOUS') continue;
    if (card.tokenEstimate > 1500) continue;
    byChange.set(id, [...(byChange.get(id) ?? []), card]);
  }
  const picked = [];
  for (const id of [...byChange.keys()].sort()) {
    const group = byChange.get(id).sort((a, b) => a.cardId.localeCompare(b.cardId));
    if (group.length < perChange) continue;
    picked.push(...group.slice(0, perChange));
    if (picked.length >= count) break;
  }
  return picked.slice(0, count);
}

/** EmbeddingGemma document recipe, identical to the corpus writer: title + trimmed text. */
export function documentInput(card) {
  return `title: ${card.taskIdentity.changeId} | text: ${card.contextBlob.trim()}`;
}

export function l2(v) {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** CPU exact top-k excluding the query itself; ties broken by cardId so the order is total. */
export function exactTopK(vectors, ids, queryIndex, k) {
  return ids
    .map((id, i) => ({ id, index: i, score: cosine(vectors[queryIndex], vectors[i]) }))
    .filter((r) => r.index !== queryIndex)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, k);
}

/** Weak structural label only: same change_id. Not relevance ground truth. */
export function weakLabelRecall(cards, vectors, k) {
  const ids = cards.map((c) => c.cardId);
  let hits = 0, possible = 0;
  const perQuery = cards.map((card, qi) => {
    const top = exactTopK(vectors, ids, qi, k);
    const sameChange = cards.filter((c, i) => i !== qi && c.taskIdentity.changeId === card.taskIdentity.changeId).length;
    const got = top.filter((t) => cards[t.index].taskIdentity.changeId === card.taskIdentity.changeId).length;
    const cap = Math.min(k, sameChange);
    hits += got; possible += cap;
    return { cardId: card.cardId, changeId: card.taskIdentity.changeId, top: top.map((t) => ({ cardId: t.id, score: Number(t.score.toFixed(6)) })), sameChangeInTopK: got, possibleSameChange: cap };
  });
  return { recall: possible ? hits / possible : null, hits, possible, perQuery };
}

async function embed(baseUrl, model, inputs) {
  const res = await fetch(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, input: inputs, truncate: false }),
    signal: AbortSignal.timeout(60_000)
  });
  if (!res.ok) throw new Error(`EMBED_HTTP_${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body.embeddings) || body.embeddings.length !== inputs.length) throw new Error('EMBED_SHAPE_MISMATCH');
  return body.embeddings;
}

function f32Bytes(vectors) {
  const buf = Buffer.alloc(vectors.length * 768 * 4);
  vectors.forEach((v, r) => v.forEach((x, c) => buf.writeFloatLE(x, (r * 768 + c) * 4)));
  return buf;
}

function parseArgs(argv) {
  const a = { count: 10, k: 3, out: '.tmp/atlas/openspec-embed-fixture', dryRun: false, cards: 'docs/reports/openspec-evidence-cards-v1.json', base: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434', model: 'embeddinggemma:latest' };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (k === '--count') a.count = Number(argv[++i]);
    else if (k === '--k') a.k = Number(argv[++i]);
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--dry-run') a.dryRun = true;
    else throw new Error(`unknown argument ${k}`);
  }
  if (!Number.isInteger(a.count) || a.count < 2 || a.count > 200) throw new Error('--count must be 2..200 (bounded fixture)');
  if (!Number.isInteger(a.k) || a.k < 1 || a.k >= a.count) throw new Error('--k must be 1..count-1');
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(readFileSync(resolve(args.cards), 'utf8'));
  const cohort = selectCohort(report.cards, args.count);
  if (cohort.length < args.count) throw new Error(`COHORT_TOO_SMALL:${cohort.length}`);
  const inputs = cohort.map(documentInput);
  const summary = { schema: FIXTURE_SCHEMA, dryRun: args.dryRun, cards: cohort.length, changes: [...new Set(cohort.map((c) => c.taskIdentity.changeId))], inputChecksum: sha256(inputs.join('\n')), executor: { kind: 'ollama', model: args.model, baseUrl: args.base } };
  if (args.dryRun) { console.log(JSON.stringify(summary, null, 2)); return; }

  const first = await embed(args.base, args.model, inputs);
  const second = await embed(args.base, args.model, inputs);
  const dims = new Set(first.map((v) => v.length));
  const norms = first.map(l2);
  const repeatCos = first.map((v, i) => cosine(v, second[i]));
  const oracle = weakLabelRecall(cohort, first, args.k);
  const out = resolve(args.out);
  mkdirSync(out, { recursive: true });
  const bytes = f32Bytes(first);
  writeFileSync(join(out, 'vectors.f32le'), bytes);
  const result = {
    ...summary,
    status: dims.size === 1 && dims.has(768) && Math.min(...repeatCos) > 0.99999 ? 'FIXTURE_OK' : 'FIXTURE_CHECK_FAILED',
    proofLabel: 'OPEN_SPEC_CPU_FIXTURE_PROVEN (determinism and numeric stability only; NOT OPEN_SPEC_SEMANTIC_TRUTH_PROVEN)',
    cohortChecksum: sha256(cohort.map((c) => c.cardId).join('\n')),
    vectors: { file: 'vectors.f32le', dimension: 768, rows: first.length, layout: 'row-major F32LE', sha256: sha256(bytes) },
    checks: { dimensions: [...dims], minL2: Math.min(...norms), maxL2: Math.max(...norms), minRepeatCosine: Math.min(...repeatCos) },
    k: args.k,
    cardOrder: cohort.map((c) => c.cardId),
    weakLabelRecallAtK: { recall: oracle.recall, hits: oracle.hits, possible: oracle.possible, label: 'same change_id; structural weak label, not relevance ground truth' },
    perQuery: oracle.perQuery,
    writesPerformed: { postgres: 0, qdrant: 0, valkey: 0, cuvs: 0, tmpFixtureOnly: true }
  };
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: result.status, cards: result.cards, changes: result.changes, checks: result.checks, weakLabelRecallAtK: result.weakLabelRecallAtK, vectorsSha256: result.vectors.sha256 }, null, 2));
  if (result.status !== 'FIXTURE_OK') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
