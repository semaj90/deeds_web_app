import { githubSearch } from '../src/lib/server/research/github-search.ts';
import { redditSearch } from '../src/lib/server/research/reddit-search.ts';
import { fastCrawl } from '../src/lib/server/research/fastcrawl.ts';
import { storeWebDoc } from '../src/lib/server/research/store-web-doc.ts';

async function main() {
  const query = process.argv[2] || 'Svelte 5 runes official documentation';
  
  console.log(`🔍 Testing Research Lane for: "${query}"`);

  // 1. GitHub Test
  console.log('\n--- GitHub Issues ---');
  try {
    const issues = await githubSearch.issues(query, 3);
    issues.forEach(i => console.log(`[${i.source}] ${i.title} (${i.url})`));
  } catch (e) { console.error('GitHub error:', e); }

  // 2. Reddit Test
  console.log('\n--- Reddit Posts ---');
  try {
    const posts = await redditSearch.search(query, 3);
    posts.forEach(p => console.log(`[${p.source}] ${p.title} (${p.url})`));
  } catch (e) { console.error('Reddit error:', e); }

  // 3. Fastcrawl Test (optional)
  if (process.argv[3]) {
    const url = process.argv[3];
    console.log(`\n--- Fastcrawl: ${url} ---`);
    try {
      const doc = await fastCrawl(url);
      if (doc) {
        console.log(`Title: ${doc.title}`);
        console.log(`Body length: ${doc.body.length}`);
        
        console.log('Storing in Qdrant...');
        const res = await storeWebDoc(doc);
        console.log(`Ingested: ${res.ingested}, Errors: ${res.errors}`);
      }
    } catch (e) { console.error('Fastcrawl error:', e); }
  }
}

main().catch(console.error);
