/**
 * Runtime verification: Check Qdrant collection vector configs match VECTOR_CONFIG expectations.
 * Run: node scripts/verify-qdrant-vectors.mjs
 */

const QDRANT_URL = 'http://localhost:6333';

const SSE_CHAT_COLLECTIONS = [
  'case_chunks', 'court_opinions', 'legal_canon_chunks',
  'legal_documents', 'evidence_vectors'
];

// Expected vector names from VECTOR_CONFIG.COLLECTION_VECTORS
const EXPECTED = {
  case_chunks: 'default',
  court_opinions: 'default',
  legal_canon_chunks: 'content',
  legal_documents: 'content',
  evidence_vectors: 'default',
  evidence_items: 'content',
  legal_cases: 'description',
  chat_messages: 'message',
  embedding_cache: 'embedding',
  poi_profiles: 'embedding',
  codebase_chunks_768: 'content',
  knowledge_base: 'default',
};

async function main() {
  // 1. List all collections
  const listRes = await fetch(`${QDRANT_URL}/collections`);
  const listData = await listRes.json();
  const existing = new Set((listData.result?.collections || []).map(c => c.name));

  console.log('=== Collection Existence ===');
  for (const col of SSE_CHAT_COLLECTIONS) {
    const status = existing.has(col) ? 'EXISTS' : 'MISSING';
    console.log(`  ${col}: ${status}`);
  }
  console.log(`  law_sections: ${existing.has('law_sections') ? 'STILL EXISTS (BUG)' : 'NOT FOUND (correct)'}`);
  console.log(`  Total Qdrant collections: ${existing.size}\n`);

  // 2. Check vector config per collection
  console.log('=== Vector Config Verification ===');
  let allPass = true;

  for (const [col, expectedVec] of Object.entries(EXPECTED)) {
    if (existing.has(col) === false) {
      console.log(`  ${col}: SKIP (not in Qdrant)`);
      continue;
    }

    try {
      const res = await fetch(`${QDRANT_URL}/collections/${col}`);
      const data = await res.json();
      const config = data.result?.config;
      const points = data.result?.points_count ?? '?';

      if (config === undefined || config === null) {
        console.log(`  ${col}: ERROR - no config returned`);
        allPass = false;
        continue;
      }

      const vectors = config.params?.vectors;
      let actualVecName;

      if (vectors === undefined || vectors === null || typeof vectors.size === 'number') {
        actualVecName = 'default';
      } else {
        const names = Object.keys(vectors);
        actualVecName = names.length === 1 ? names[0] : names.join('+');
      }

      const match = (expectedVec === 'default' && actualVecName === 'default') ||
                    actualVecName.includes(expectedVec);
      const quant = config.quantization_config ? 'INT8' : 'NONE';
      const status = match ? 'PASS' : 'FAIL';

      if (status === 'FAIL') allPass = false;

      console.log(`  ${col}: ${status} | expected=${expectedVec} actual=${actualVecName} | quant=${quant} | points=${points}`);
    } catch (e) {
      console.log(`  ${col}: ERROR - ${e.message}`);
      allPass = false;
    }
  }

  console.log(`\n=== Overall: ${allPass ? 'ALL PASS' : 'SOME FAILURES'} ===`);
  process.exit(allPass ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});