import { redditSearch } from '../src/lib/server/research/reddit-search.js';
import { storeWebDoc } from '../src/lib/server/research/store-web-doc.js';

async function test() {
  console.log('🔍 Testing Reddit Search...');
  try {
    const results = await redditSearch.search('Svelte 5 runes performance', 2);
    console.log(`✅ Found ${results.length} results`);
    
    if (results.length > 0) {
      console.log('📦 Testing Ingestion...');
      const first = results[0];
      const res = await storeWebDoc(first);
      console.log('✅ Ingestion result:', res);
    }
  } catch (e) {
    console.error('❌ Test failed:', e);
  }
}

test();
