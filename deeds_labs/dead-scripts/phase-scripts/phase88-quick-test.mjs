#!/usr/bin/env node
/**
 * Phase 88: Quick KB Test (Single Error)
 *
 * Tests one error to verify the pipeline works
 */

const FASTMCP_URL = 'http://localhost:3002';

async function testKB() {
	console.log('🧪 Phase 88: Quick KB Test\n');

	// Test case: Svelte 5 export let → $props()
	const testQuery = 'Svelte 5 component props how to replace export let';

	console.log(`📝 Query: "${testQuery}"\n`);

	try {
		const response = await fetch(`${FASTMCP_URL}/function-call`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: 'knowledge_retrieve',
				arguments: { query: testQuery, limit: 3, threshold: 0.5 }
			})
		});

		if (!response.ok) {
			throw new Error(`FastMCP error: ${response.statusText}`);
		}

		const data = await response.json();

		console.log('✅ KB Retrieved:\n');
		console.log(`   Method: ${data.retrieval_method || 'unknown'}`);
		console.log(`   Results: ${data.contexts?.length || data.results?.length || 0}`);

		if (data.contexts && data.contexts.length > 0) {
			console.log('\n📄 Top Result:');
			const top = data.contexts[0];
			console.log(`   Score: ${top.score}`);
			console.log(`   Source: ${top.provenance?.source || 'unknown'}`);
			console.log(`   Text: ${top.text.substring(0, 200)}...`);

			// Check if it contains $props() pattern
			const hasPropsPattern = /\$props\(\)/.test(top.text);
			console.log(`\n🎯 Contains $props() pattern: ${hasPropsPattern ? '✅ YES' : '❌ NO'}`);
		} else if (data.results && data.results.length > 0) {
			console.log('\n📄 Top Result:');
			const top = data.results[0];
			console.log(`   Score: ${top.score || 'N/A'}`);
			console.log(`   URL: ${top.url || top.source || 'unknown'}`);
			console.log(`   Text: ${(top.text || top.content || top.summary || '').substring(0, 200)}...`);
		} else {
			console.log('\n⚠️  No results returned');
		}

		console.log('\n✅ Test complete!');
	} catch (error) {
		console.error('\n❌ Test failed:', error.message);
		process.exit(1);
	}
}

testKB();
