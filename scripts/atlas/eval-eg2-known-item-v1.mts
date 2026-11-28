// Known-item retrieval check for the EmbeddingGemma 2 challenger index.
// Each query is a line taken from an indexed chunk; the expected hit is that chunk.
// This is a sanity check (self-retrieval), not a relevance benchmark.
// EG2-only self-retrieval sanity check. It deliberately does not call the canonical EG1
// embedding service or compare vectors from a different model/recipe.
// Usage (from sveltekit-frontend/): npx tsx ../scripts/atlas/eval-eg2-known-item-v1.mts [queries=100]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  createEmbeddingGemma2ChallengerExecutorV1,
  EMBEDDINGGEMMA2_CHALLENGER_MODEL,
  EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION,
} from '../../sveltekit-frontend/src/lib/server/atlas/embedding/embeddinggemma2-challenger-executor-v1.ts';
import { encodeCodeRetrievalQuery, EMBEDDINGGEMMA_PROMPT_REVISION_V1 } from '../../sveltekit-frontend/src/lib/server/atlas/embedding/embeddinggemma-task-representation-v1.ts';

const REPRESENTATION_ID = 'embeddinggemma2-q8-code-retrieval-doc-v2';

const require = createRequire(path.resolve('package.json'));
const { Client } = require('pg');
const args = process.argv.slice(2);
const queryCount = Number(args.find((arg) => !arg.startsWith('--')) ?? 100);
if (!Number.isSafeInteger(queryCount) || queryCount < 1 || queryCount > 1_000) {
  throw new Error('QUERY_COUNT_OUT_OF_RANGE: expected an integer from 1 to 1000');
}
const repoRoot = path.resolve('..');
const outputArg = args.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
const runStamp = new Date().toISOString().replaceAll(':', '').replaceAll('-', '');
const out = path.resolve(repoRoot, outputArg ?? path.join('.tmp', 'review', `eg2-known-item-eval-${runStamp}.json`));
const outputRelative = path.relative(repoRoot, out);
if (!outputRelative || outputRelative === '..' || outputRelative.startsWith(`..${path.sep}`) || path.isAbsolute(outputRelative)) {
  throw new Error('REPORT_PATH_OUTSIDE_REPOSITORY');
}
if (outputArg && outputRelative !== '.tmp' && !outputRelative.startsWith(`.tmp${path.sep}`)) {
  throw new Error('CUSTOM_REPORT_PATH_MUST_BE_UNDER_TMP');
}
const envLine = readFileSync(path.join(repoRoot, '.env'), 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
const client = new Client({ connectionString: envLine!.slice('DATABASE_URL='.length).trim() });
await client.connect();
await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

try {
  // Keep the evaluation corpus inside one EG2 representation and model revision.
  const { rows } = await client.query(
    `SELECT e.source_id::text AS id, c.content
       FROM codebase_chunk_eg2_embeddings e
       JOIN codebase_chunk_index c ON c.id = e.source_id
      WHERE e.representation_id = $1
        AND e.model_revision = $2
        AND e.embedding IS NOT NULL
        AND c.content IS NOT NULL
      ORDER BY e.source_id`,
    [REPRESENTATION_ID, EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION],
  );
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
  const tally = { r1: 0, r5: 0, r10: 0 };
  for (const p of picks) {
    // Both stored documents and query use the EG2 task-format owner. The document
    // path is retrieval_document; query text uses the paired code_retrieval_query mode.
    const formattedQuery = encodeCodeRetrievalQuery(p.query);
    const { vector } = await eg2.embedNative768(formattedQuery.formattedText);
    const literal = `[${Array.from(vector).join(',')}]`;
    const eg2Rank = (await client.query(
      `SELECT source_id::text AS id
         FROM codebase_chunk_eg2_embeddings
        WHERE representation_id = $2
          AND model_revision = $3
          AND source_id = ANY($4::uuid[])
        ORDER BY embedding <=> $1::halfvec
        LIMIT 10`,
      [literal, REPRESENTATION_ID, EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION, subsetIds],
    )).rows.map((r) => r.id);
    if (hitsAt(eg2Rank, p.id, 1)) tally.r1 += 1;
    if (hitsAt(eg2Rank, p.id, 5)) tally.r5 += 1;
    if (hitsAt(eg2Rank, p.id, 10)) tally.r10 += 1;
  }

  const n = picks.length;
  const pct = (x: number) => n === 0 ? 0 : Number((100 * x / n).toFixed(1));
  const receipt = {
    schema: 'atlas.eg2-known-item-eval.v1',
    generatedAt: new Date().toISOString(),
    kind: 'SELF_RETRIEVAL_SANITY_NOT_RELEVANCE',
    canonicalAuthority: false,
    promotionEligible: false,
    subsetSize: rows.length,
    queries: n,
    representation: {
      model: EMBEDDINGGEMMA2_CHALLENGER_MODEL,
      modelRevision: EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION,
      representationId: REPRESENTATION_ID,
      promptRevision: EMBEDDINGGEMMA_PROMPT_REVISION_V1,
      documentMode: 'retrieval_document',
      queryMode: 'code_retrieval_query',
      dimensions: 768,
      normalization: 'l2',
    },
    eg2SelfRetrieval: { recallAt1Pct: pct(tally.r1), recallAt5Pct: pct(tally.r5), recallAt10Pct: pct(tally.r10) },
    sourceAuthority: 'NOT_CHECKED_BY_THIS_EVALUATOR',
  };
  if (existsSync(out)) throw new Error(`REFUSING_TO_OVERWRITE_RECEIPT:${path.relative(repoRoot, out)}`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ ...receipt, receipt: path.relative(repoRoot, out) }, null, 2));
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
