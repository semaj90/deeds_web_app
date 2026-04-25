#!/usr/bin/env node
/**
 * Test ACE MCP Tools Integration
 * Verifies ace_smart_search, ace_timeline_recent, ace_timeline_verify
 */

const MCP_URL = process.env.MCP_URL || 'http://localhost:3002';

/**
 * Call MCP tool
 */
async function callMCPTool(toolName, args = {}) {
	console.log(`\n🔧 Calling ${toolName}...`);
	console.log(`   Args:`, JSON.stringify(args, null, 2));

	const response = await fetch(`${MCP_URL}/function-call`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			name: toolName,
			arguments: args
		})
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}

	const result = await response.json();
	return result;
}

/**
 * Test Suite
 */
async function runTests() {
	console.log('🧪 ACE MCP Tools Test Suite');
	console.log('═'.repeat(60));
	console.log(`MCP Server: ${MCP_URL}`);

	try {
		// Test 1: ACE Smart Search
		console.log('\n\n📌 Test 1: ace_smart_search (typescript errors)');
		console.log('─'.repeat(60));

		const searchResult = await callMCPTool('ace_smart_search', {
			query: 'typescript errors',
			limit: 3,
			collection: 'phase89_cache_index'
		});

		console.log('\n✅ Result:');
		console.log(`   OK: ${searchResult.ok}`);
		if (searchResult.ok) {
			console.log(`   Query: ${searchResult.query}`);
			console.log(`   Intent:`, JSON.stringify(searchResult.intent, null, 2));
			console.log(`   Results: ${searchResult.results?.length || 0}`);
			console.log(`   Timings:`, searchResult.timings);
			console.log(`   Stats:`, searchResult.stats);

			if (searchResult.results && searchResult.results.length > 0) {
				console.log(`\n   Top Result:`);
				const top = searchResult.results[0];
				console.log(`      Score: ${top.score}`);
				console.log(`      Confidence: ${top.confidence}`);
				console.log(`      Tags: ${top.tags?.join(', ')}`);
			}
		} else {
			console.log(`   Error: ${searchResult.error}`);
		}

		// Test 2: ACE Timeline Recent
		console.log('\n\n📌 Test 2: ace_timeline_recent (last 24 hours)');
		console.log('─'.repeat(60));

		const timelineResult = await callMCPTool('ace_timeline_recent', {
			hours: 24,
			limit: 5
		});

		console.log('\n✅ Result:');
		console.log(`   OK: ${timelineResult.ok}`);
		if (timelineResult.ok) {
			console.log(`   Count: ${timelineResult.count}`);
			console.log(`   Hours: ${timelineResult.hours}`);
			console.log(`   Recent Edits: ${timelineResult.recent_edits?.length || 0}`);

			if (timelineResult.recent_edits && timelineResult.recent_edits.length > 0) {
				console.log(`\n   Latest Edit:`);
				const latest = timelineResult.recent_edits[0];
				console.log(`      Op: ${latest.op}`);
				console.log(`      Collection: ${latest.collection}`);
				console.log(`      Actor: ${latest.actor}`);
				console.log(`      Time: ${latest.ts}`);
				if (latest.notes) console.log(`      Notes: ${latest.notes}`);
			}
		} else {
			console.log(`   Error: ${timelineResult.error}`);
		}

		// Test 3: ACE Timeline Verify
		console.log('\n\n📌 Test 3: ace_timeline_verify (collection status)');
		console.log('─'.repeat(60));

		const verifyResult = await callMCPTool('ace_timeline_verify', {});

		console.log('\n✅ Result:');
		console.log(`   OK: ${verifyResult.ok}`);
		if (verifyResult.ok) {
			console.log(`   Collection: ${verifyResult.collection}`);
			console.log(`   Exists: ${verifyResult.exists}`);
			console.log(`   Points: ${verifyResult.points}`);
			console.log(`   Status: ${verifyResult.status}`);
			console.log(`   Type: ${verifyResult.meta?.collection_type}`);
		} else {
			console.log(`   Error: ${verifyResult.error}`);
		}

		// Summary
		console.log('\n\n📊 Test Summary');
		console.log('═'.repeat(60));
		console.log(`✅ ace_smart_search: ${searchResult.ok ? 'PASS' : 'FAIL'}`);
		console.log(`✅ ace_timeline_recent: ${timelineResult.ok ? 'PASS' : 'FAIL'}`);
		console.log(`✅ ace_timeline_verify: ${verifyResult.ok ? 'PASS' : 'FAIL'}`);

		const allPassed = searchResult.ok && timelineResult.ok && verifyResult.ok;
		console.log(`\n${allPassed ? '🎉' : '⚠️'} All Tests ${allPassed ? 'Passed' : 'Failed'}!`);
		console.log();

	} catch (error) {
		console.error('\n❌ Test Suite Failed:', error);
		console.error(error.stack);
		process.exit(1);
	}
}

// Health check first
async function healthCheck() {
	try {
		const response = await fetch(`${MCP_URL}/health`);
		if (!response.ok) {
			throw new Error(`MCP server not responding: ${response.statusText}`);
		}
		const health = await response.json();
		console.log(`✅ MCP Server Healthy`);
		console.log(`   Status: ${health.status}`);
		console.log(`   Tools: ${health.tools}`);
		return true;
	} catch (error) {
		console.error(`❌ MCP Server Unreachable: ${error.message}`);
		console.error(`   Make sure to start: node scripts/fastmcp-server.mjs`);
		return false;
	}
}

// Main
(async () => {
	const healthy = await healthCheck();
	if (!healthy) {
		process.exit(1);
	}

	await runTests();
})();
