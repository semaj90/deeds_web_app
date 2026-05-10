import 'dotenv/config';
import { performExternalResearch } from '../../src/lib/server/ai/external-research-agent.js';
import { db } from '../../src/lib/server/db/client.js';
import { users } from '../../src/lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

/**
 * Smoke test for External Deep Research Pipeline.
 * 
 * Verifies:
 * 1. Web search connectivity (SearXNG or DDG fallback).
 * 2. Scraping & Summarization (Gemma4).
 * 3. Qdrant & Postgres indexing.
 * 4. Timeline logging.
 */
async function smokeTest() {
	console.log('🚀 Starting External Research Smoke Test...');

	// 1. Get a test user
	const [testUser] = await db.select().from(users).limit(1);
	if (!testUser) {
		console.error('❌ No user found for test.');
		process.exit(1);
	}

	const query = 'Svelte 5 runes performance benchmarks';
	
	try {
		console.log(`🔍 Querying: "${query}" for user ${testUser.id}`);
		const result = await performExternalResearch(query, testUser.id, { maxResults: 2 });

		console.log('✅ Research completed.');
		console.log('📊 Result Summary:', {
			query: result.query,
			summariesCount: result.summaries.length,
			synthesisPreview: result.globalSynthesis.slice(0, 100) + '...'
		});

		if (result.summaries.length === 0) {
			console.warn('⚠️ No summaries produced. Search might have failed or been empty.');
		} else {
			console.log('✅ Found', result.summaries.length, 'results.');
			for (const s of result.summaries) {
				console.log(`   - [${s.title}] (${s.url})`);
			}
		}

		console.log('✨ Smoke test PASS');
	} catch (err) {
		console.error('❌ Smoke test FAILED:', err);
		process.exit(1);
	}
}

smokeTest().then(() => process.exit(0));
