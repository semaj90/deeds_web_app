// Batch builder for the separate EmbeddingGemma 2 challenger index.
// Reads chunks from codebase_chunk_index (read-only), embeds them with the existing
// challenger executor, writes codebase_chunk_eg2_embeddings, then reads back and writes a receipt.
// Usage (from sveltekit-frontend/): npx tsx ../scripts/atlas/build-eg2-index-batch-v1.mts [limit]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createEmbeddingGemma2ChallengerExecutorV1, EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION } from '../../sveltekit-frontend/src/lib/server/atlas/embedding/embeddinggemma2-challenger-executor-v1.ts';

const require = createRequire(path.resolve('package.json'));
const { Client } = require('pg');

const limit = Number(process.argv[2] ?? 1000);
const repoRoot = path.resolve('..');
const envLine = readFileSync(path.join(repoRoot, '.env'), 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
if (!envLine) throw new Error('DATABASE_URL missing in .env');
const databaseUrl = envLine.slice('DATABASE_URL='.length).trim();

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const { rows } = await client.query(
    `SELECT c.id, c.relative_path, c.domain, c.content_hash, c.content
       FROM codebase_chunk_index c
      WHERE c.content IS NOT NULL AND length(c.content) > 0
        AND NOT EXISTS (SELECT 1 FROM codebase_chunk_eg2_embeddings e WHERE e.source_id = c.id)
      ORDER BY c.id
      LIMIT $1`,
    [limit],
  );

  const executor = createEmbeddingGemma2ChallengerExecutorV1();
  const started = Date.now();
  let inserted = 0;
  const failures: { id: string; error: string }[] = [];
  for (const row of rows) {
    try {
      const { vector } = await executor.embedNative768(String(row.content).slice(0, 4000));
      const literal = `[${Array.from(vector).join(',')}]`;
      const res = await client.query(
        `INSERT INTO codebase_chunk_eg2_embeddings
           (source_id, relative_path, domain, content_hash, representation_id, model_revision, embedding)
         VALUES ($1, $2, $3, $4, 'embeddinggemma2-q8-challenger', $5, $6::halfvec)
         ON CONFLICT (source_id) DO NOTHING`,
        [row.id, row.relative_path, row.domain, row.content_hash, EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION, literal],
      );
      inserted += res.rowCount ?? 0;
    } catch (error) {
      failures.push({ id: row.id, error: (error as Error).message.slice(0, 200) });
    }
  }
  const elapsedMs = Date.now() - started;

  // Readback: every written row must join to a live source row and have 768 dimensions.
  const readback = await client.query(
    `SELECT count(*)::int AS total,
            count(c.id)::int AS joined,
            count(*) FILTER (WHERE vector_dims(e.embedding) = 768)::int AS dim768
       FROM codebase_chunk_eg2_embeddings e
       LEFT JOIN codebase_chunk_index c ON c.id = e.source_id`,
  );

  const receipt = {
    schema: 'atlas.eg2-challenger-index-batch.v1',
    generatedAt: new Date().toISOString(),
    table: 'codebase_chunk_eg2_embeddings',
    representationId: 'embeddinggemma2-q8-challenger',
    modelRevision: EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION,
    canonicalDefaultChanged: false,
    requested: limit,
    selected: rows.length,
    inserted,
    failures: failures.length,
    failureSamples: failures.slice(0, 5),
    elapsedMs,
    readback: readback.rows[0],
  };
  const out = path.join(repoRoot, 'docs', 'reports', `eg2-index-batch-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ ...receipt, failureSamples: undefined, receipt: path.relative(repoRoot, out) }, null, 2));
} finally {
  await client.end();
}
