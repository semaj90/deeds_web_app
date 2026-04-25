// Quick smoke test for the EmbeddingRepository → pgvector pipeline
// Runs independently of the SvelteKit dev server.

import { getEmbeddingRepository } from '../src/lib/server/embedding/embedding-repository';

async function main() {
  const query = process.argv.slice(2).join(' ') || 'contract liability terms';
  const limit = Number(process.env.VECTOR_LIMIT || '5');
  console.log(`🔎 Vector search smoke test → query="${query}" (limit=${limit})`);

  try {
    const repo = await getEmbeddingRepository();
    const results = await repo.querySimilar(query, { limit });
    console.log(`✅ Results: ${results.length}`);
    for (const r of results) {
      console.log(
        `- [${(r.score * 100).toFixed(1)}%] ${r.documentId || r.id} :: ${r.content.substring(0, 100).replace(/\s+/g, ' ')}${r.content.length > 100 ? '…' : ''}`
      );
    }
    if (results.length === 0) {
      console.log(
        'ℹ️ No results. Ensure you have ingested content into document_chunks (embedding present).'
      );
    }
  } catch (err: any) {
    console.error('❌ Smoke test failed:', err?.message || err);
    process.exitCode = 1;
  }
}

main();
