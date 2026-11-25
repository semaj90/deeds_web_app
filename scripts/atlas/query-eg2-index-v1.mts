// Retrieval + ranking over the separate EmbeddingGemma 2 challenger index.
// Embeds each query with the challenger executor and ranks codebase_chunk_eg2_embeddings
// by cosine distance (HNSW), optionally restricted to one domain.
// Usage (from sveltekit-frontend/): npx tsx ../scripts/atlas/query-eg2-index-v1.mts [--domain=<d>] [--k=5] "query text" ...
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createEmbeddingGemma2ChallengerExecutorV1, EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION } from '../../sveltekit-frontend/src/lib/server/atlas/embedding/embeddinggemma2-challenger-executor-v1.ts';
import { encodeCodeRetrievalQuery, EMBEDDINGGEMMA_PROMPT_REVISION_V1 } from '../../sveltekit-frontend/src/lib/server/atlas/embedding/embeddinggemma-task-representation-v1.ts';

const require = createRequire(path.resolve('package.json'));
const { Client } = require('pg');

const args = process.argv.slice(2);
const domain = args.find((a) => a.startsWith('--domain='))?.slice('--domain='.length) ?? null;
const k = Number(args.find((a) => a.startsWith('--k='))?.slice('--k='.length) ?? 5);
const queries = args.filter((a) => !a.startsWith('--'));
if (queries.length === 0) throw new Error('pass at least one query string');

const envLine = readFileSync(path.join(path.resolve('..'), '.env'), 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
const client = new Client({ connectionString: envLine!.slice('DATABASE_URL='.length).trim() });
await client.connect();
const executor = createEmbeddingGemma2ChallengerExecutorV1();
const representationId = 'embeddinggemma2-q8-code-retrieval-doc-v2';
try {
  for (const q of queries) {
    const formatted = encodeCodeRetrievalQuery(q);
    const { vector } = await executor.embedNative768(formatted.formattedText);
    const literal = `[${Array.from(vector).join(',')}]`;
    const { rows } = await client.query(
      `SELECT e.relative_path, e.domain, (e.embedding <=> $1::halfvec) AS distance
         FROM codebase_chunk_eg2_embeddings e
         WHERE e.representation_id = $2
           AND e.model_revision = $3
           AND ($4::text IS NULL OR e.domain = $4)
        ORDER BY e.embedding <=> $1::halfvec
        LIMIT $5`,
      [literal, representationId, EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION, domain, k],
    );
    console.log(`\nQUERY: ${q}${domain ? `  [domain=${domain}]` : ''}  [recipe=${representationId}; prompt=${EMBEDDINGGEMMA_PROMPT_REVISION_V1}]`);
    rows.forEach((r, i) => console.log(`  ${i + 1}. ${(1 - Number(r.distance)).toFixed(4)}  ${r.domain ?? '-'}  ${r.relative_path}`));
  }
} finally {
  await client.end();
}
