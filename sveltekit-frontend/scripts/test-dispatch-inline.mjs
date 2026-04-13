#!/usr/bin/env node

/**
 * Test dispatch-inline.ts implementation
 * Verifies:
 * 1. Module loads correctly
 * 2. dispatchOrExecuteInline function exists
 * 3. getDispatchStats function exists
 * 4. QueueName type is exported
 */

console.log('\n🧪 Testing dispatch-inline implementation...\n');

try {
	// Test 1: Module import
	console.log('Test 1: Importing dispatch-inline module...');
	const module = await import('../src/lib/server/queue/dispatch-inline.js');
	console.log('✅ Module imported successfully');

	// Test 2: Check exports
	console.log('\nTest 2: Checking exported functions...');
	if (typeof module.dispatchOrExecuteInline !== 'function') {
		throw new Error('dispatchOrExecuteInline is not exported or not a function');
	}
	console.log('✅ dispatchOrExecuteInline function exists');

	if (typeof module.getDispatchStats !== 'function') {
		throw new Error('getDispatchStats is not exported or not a function');
	}
	console.log('✅ getDispatchStats function exists');

	// Test 3: Get initial stats
	console.log('\nTest 3: Getting initial stats...');
	const stats = module.getDispatchStats();
	console.log('✅ Stats retrieved:', JSON.stringify(stats, null, 2));

	if (typeof stats.queued !== 'number') {
		throw new Error('stats.queued is not a number');
	}
	if (typeof stats.inline !== 'number') {
		throw new Error('stats.inline is not a number');
	}
	if (typeof stats.skipped !== 'number') {
		throw new Error('stats.skipped is not a number');
	}
	if (typeof stats.errors !== 'number') {
		throw new Error('stats.errors is not a number');
	}
	console.log('✅ All stat fields are numbers');

	// Test 4: Try a non-blocking analytics dispatch (RabbitMQ likely down in dev)
	console.log('\nTest 4: Testing dispatch with RabbitMQ unavailable...');
	const result = await module.dispatchOrExecuteInline('analytics.track', {
		eventType: 'test.dispatch_inline_verification',
		payload: {
			timestamp: new Date().toISOString(),
			test: true
		}
	});

	console.log('✅ Dispatch completed:', JSON.stringify(result, null, 2));

	if (!['queued', 'inline', 'skipped'].includes(result.mode)) {
		throw new Error(`Invalid mode: ${result.mode}`);
	}
	console.log(`✅ Mode is valid: ${result.mode}`);

	// Test 5: Verify stats updated
	console.log('\nTest 5: Verifying stats were updated...');
	const updatedStats = module.getDispatchStats();
	console.log('✅ Updated stats:', JSON.stringify(updatedStats, null, 2));

	const totalCalls =
		updatedStats.queued + updatedStats.inline + updatedStats.skipped + updatedStats.errors;
	if (totalCalls === 0) {
		throw new Error('Stats did not update after dispatch');
	}
	console.log(`✅ Stats updated correctly (${totalCalls} total calls)`);

	console.log('\n╔════════════════════════════════════════════════════════╗');
	console.log('║  ✅ ALL TESTS PASSED — dispatch-inline is working!   ║');
	console.log('╚════════════════════════════════════════════════════════╝\n');

	console.log('Summary:');
	console.log(`  Mode: ${result.mode}`);
	console.log(`  Duration: ${result.durationMs || 'N/A'}ms`);
	console.log(`  Total dispatches: queued=${updatedStats.queued}, inline=${updatedStats.inline}, skipped=${updatedStats.skipped}, errors=${updatedStats.errors}`);
	console.log('');

	process.exit(0);
} catch (err) {
	console.error('\n❌ TEST FAILED:');
	console.error(err.message);
	console.error('\nStack trace:');
	console.error(err.stack);
	process.exit(1);
}
