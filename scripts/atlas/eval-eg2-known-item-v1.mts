// Known-item retrieval check for the EmbeddingGemma 2 challenger index.
// Each query is a line taken from an indexed chunk; the expected hit is that chunk.
// This is a sanity check (self-retrieval), not a relevance benchmark.
// Baseline: canonical content_embedding_768 on the SAME chunk subset, queried with the
// canonical Ollama embeddinggemma:latest path (no prefixes), so both sides see the same corpus.
// Usage (from sveltekit-frontend/): npx tsx ../scripts/atlas/eval-eg2-known-item-v1.mts [queries=100]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createEmbeddingGemma2ChallengerExecutorV1, EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION } from '../../sveltekit-frontend/src/lib/server/atlas/embedding/embeddinggemma2-challenger-executor-v1.ts';

const require = createRequire(path.resolve('package.json'));
const { Client } = require('pg');
const queryCount = Number(process.argv[2] ?? 100);
const repoRoot = path.resolve('..');
const envLine = readFileSync(path.join(repoRoot, '.env'), 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
const client = new Client({ connectionString: envLine!.slice('DATABASE_URL='.length).trim() });
await client.connect();

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};
const parseVec = (s: string) => s.slice(1, -1).split(',').map(Number);

try {
  // Subset = indexed challenger chunks that also have a canonical 768 vector.
  const { rows } = await client.query(
    `SELECT e.source_id::text AS id, c.content, c.content_embedding_768::text AS canon
       FROM codebase_chunk_eg2_embeddings e
       JOIN codebase_chunk_index c ON c.id = e.source_id
      WHERE c.content_embedding_768 IS NOT NULL AND c.content IS NOT NULL
      ORDER BY e.source_id`,
  );
  const canon = new Map<string, number[]>(rows.map((r) => [r.id, parseVec(r.canon)]));
  const subsetIds = rows.map((r) => r.id);

  // Pick queries: every k-th chunk, one line of 30-160 chars from its body.
  const step = Math.max(1, Math.floor(rows.length / queryCount));
  const picks: { id: string; query: string }[] = [];
  for (let i = 0; i < rows.length && picks.length < queryCount; i += step) {
    const lines = String(rows[i].content).split('\n').map((l) => l.trim()).filter((l) => l.length >= 30 && l.length <= 160);
    if (lines.length) picks.push({ id: rows[i].id, query: lines[Math.floor(lines.length / 2)] });
  }

  const eg2 = createEmbeddingGemma2ChallengerExecutorV1();
  const hitsAt = (ranked: string[], expected: string, k: number) => ranked.slice(0, k).includes(expected);
  const tally = { eg2: { r1: 0, r5: 0, r10: 0 }, canon: { r1: 0, r5: 0, r10: 0 } };
  for (const p of picks) {
    // Challenger: ranked via the HNSW index, restricted to the subset.
    const { vector } = await eg2.embedNative768(p.query);
    const literal = `[${Array.from(vector).join(',')}]`;
    const eg2Rank = (await client.query(
      `SELECT source_id::text AS id FROM codebase_chunk_eg2_embeddings ORDER BY embedding <=> $1::halfvec LIMIT 10`,
      [literal],
    )).rows.map((r) => r.id);

    // Canonical: embed the same query with the canonical Ollama model, rank the same subset in JS.
    const res = await fetch('http://127.0.0.1:11434/api/embed', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', input: [p.query] }),
    });
    const qCanon = ((await res.json()) as { embeddings: number[][] }).embeddings[0];
    const canonRank = subsetIds
      .map((id) => ({ id, s: cosine(qCanon, canon.get(id)!) }))
      .sort((a, b) => b.s - a.s).slice(0, 10).map((x) => x.id);

    for (const [name, ranked] of [['eg2', eg2Rank], ['canon', canonRank]] as const) {
      if (hitsAt(ranked, p.id, 1)) tally[name].r1 += 1;
      if (hitsAt(ranked, p.id, 5)) tally[name].r5 += 1;
      if (hitsAt(ranked, p.id, 10)) tally[name].r10 += 1;
    }
  }

  const n = picks.length;
  const pct = (x: number) => Number((100 * x / n).toFixed(1));
  const receipt = {
    schema: 'atlas.eg2-known-item-eval.v1',
    generatedAt: new Date().toISOString(),
    kind: 'SELF_RETRIEVAL_SANITY_NOT_RELEVANCE',
    subsetSize: rows.length,
    queries: n,
    challenger: { model: 'embeddinggemma2:q8_0', modelRevision: EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION, recallAt1Pct: pct(tally.eg2.r1), recallAt5Pct: pct(tally.eg2.r5), recallAt10Pct: pct(tally.eg2.r10) },
    canonical: { model: 'embeddinggemma:latest', column: 'codebase_chunk_index.content_embedding_768', recallAt1Pct: pct(tally.canon.r1), recallAt5Pct: pct(tally.canon.r5), recallAt10Pct: pct(tally.canon.r10) },
    canonicalDefaultChanged: false,
  };
  const out = path.join(repoRoot, 'docs', 'reports', `eg2-known-item-eval-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ ...receipt, receipt: path.relative(repoRoot, out) }, null, 2));
} finally {
  await client.end();
}
