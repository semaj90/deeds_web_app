#!/usr/bin/env node
// Read-only EmbeddingGemma parity sample: embeddinggemma:latest (canonical) vs embeddinggemma2:q8_0 (challenger).
// Embeds a fixed sample of repo docs through Ollama /api/embed. Writes no database rows.
// Writes one NEW receipt file under docs/reports (never overwrites).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OLLAMA = process.env.OLLAMA_HOST_URL || 'http://127.0.0.1:11434';
const CANON = 'embeddinggemma:latest';
const CHALL = 'embeddinggemma2:q8_0';
const PASSAGE_COUNT = 40;
const TOP_K = 5;

// Deterministic sample: first substantial paragraph of each openwiki page, sorted by path.
function samplePassages() {
  const dir = path.join(ROOT, 'openwiki');
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) files.push(p);
    }
  };
  walk(dir);
  files.sort();
  const out = [];
  for (const f of files) {
    const paras = fs.readFileSync(f, 'utf8').split(/\n\s*\n/).map((p) => p.trim())
      .filter((p) => p.length >= 160 && p.length <= 900 && !p.startsWith('#'));
    if (paras.length) out.push({ source: path.relative(ROOT, f).split(path.sep).join('/'), text: paras[0] });
    if (out.length >= PASSAGE_COUNT) break;
  }
  return out;
}

async function embed(model, inputs) {
  const res = await fetch(`${OLLAMA}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: inputs }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`EMBED_HTTP_${res.status}:${model}`);
  const body = await res.json();
  return body.embeddings;
}

const cos = (a, b) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb));
};

const topK = (qv, corpus) => corpus
  .map((v, i) => ({ i, s: cos(qv, v) }))
  .sort((x, y) => y.s - x.s || x.i - y.i)
  .slice(0, TOP_K)
  .map((x) => x.i);

async function main() {
  const passages = samplePassages();
  const texts = passages.map((p) => p.text);
  // Query = first sentence of each passage; the correct answer is its own passage.
  const queries = texts.map((t) => t.split(/(?<=[.!?])\s/)[0].slice(0, 300));

  const [cDoc, cQ] = [await embed(CANON, texts), await embed(CANON, queries)];
  const [hDoc, hQ] = [await embed(CHALL, texts), await embed(CHALL, queries)];

  const dims = { canonical: cDoc[0].length, challenger: hDoc[0].length };
  const selfTop1 = { canonical: 0, challenger: 0 };
  let overlapSum = 0;
  const perQuery = [];
  queries.forEach((_, qi) => {
    const cTop = topK(cQ[qi], cDoc);
    const hTop = topK(hQ[qi], hDoc);
    if (cTop[0] === qi) selfTop1.canonical++;
    if (hTop[0] === qi) selfTop1.challenger++;
    const overlap = cTop.filter((x) => hTop.includes(x)).length / TOP_K;
    overlapSum += overlap;
    perQuery.push({ source: passages[qi].source, canonicalTop1Self: cTop[0] === qi, challengerTop1Self: hTop[0] === qi, topKOverlap: overlap });
  });
  const n = queries.length;
  const receipt = {
    schema: 'atlas.eg2-parity-sample.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    writesPerformed: false,
    canonicalAuthority: false,
    canonicalModel: CANON,
    challengerModel: CHALL,
    sampleSize: n,
    sampleSource: 'openwiki/**/*.md first substantial paragraph per page (sorted)',
    dimensions: dims,
    selfRetrievalTop1: { canonical: selfTop1.canonical / n, challenger: selfTop1.challenger / n },
    meanTopKOverlap: overlapSum / n,
    topK: TOP_K,
    verdict: 'SAMPLE_ONLY_NOT_PARITY_PROOF',
    note: 'Small in-repo sample through Ollama. Does not use the canonical corpus or Postgres; not a migration receipt.',
    perQuery,
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(ROOT, 'docs', 'reports', `embeddinggemma2-parity-sample-v1.${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ dimensions: dims, sampleSize: n, selfRetrievalTop1: receipt.selfRetrievalTop1, meanTopKOverlap: receipt.meanTopKOverlap, verdict: receipt.verdict, receipt: path.relative(ROOT, out) }, null, 2));
}

main().catch((err) => { console.error(String(err?.stack ?? err)); process.exitCode = 1; });
