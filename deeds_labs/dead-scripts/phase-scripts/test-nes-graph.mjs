#!/usr/bin/env node

/**
 * Test script for NES Graph Admin UI
 * Verifies the route exists and can be accessed
 */

console.log('🎮 Testing NES Graph Admin UI...\n');

const testUrl = 'http://127.0.0.1:5173/ast_graph_error_analysis';

async function testRoute() {
	try {
		console.log(`📡 Fetching: ${testUrl}`);
		const response = await fetch(testUrl);

		console.log(`📊 Status: ${response.status} ${response.statusText}`);

		if (response.ok) {
			const html = await response.text();

			// Check for key elements
			const checks = {
				'NES Layout': html.includes('nes-admin-layout'),
				'Canvas Graph': html.includes('nes-graph-canvas'),
				'Error Clusters': html.includes('ERROR CLUSTERS'),
				'Phase 72': html.includes('Phase 72'),
				'bits-ui Dialog': html.includes('Dialog.Root')
			};

			console.log('\n✅ Page loaded successfully!\n');
			console.log('🔍 Component Checks:');
			Object.entries(checks).forEach(([name, found]) => {
				console.log(`  ${found ? '✅' : '❌'} ${name}`);
			});

			const allPassed = Object.values(checks).every(v => v);

			if (allPassed) {
				console.log('\n🎉 All checks passed! NES Graph is ready.');
				console.log(`\n🌐 Open in browser: ${testUrl}`);
			} else {
				console.log('\n⚠️  Some components missing. Check the page source.');
			}

			return allPassed;
		} else {
			console.error(`\n❌ Page failed to load: ${response.status}`);
			return false;
		}
	} catch (error) {
		console.error('\n❌ Error testing route:', error.message);
		console.log('\n💡 Make sure dev server is running: npm run dev:quic');
		return false;
	}
}

testRoute().then(success => {
	process.exit(success ? 0 : 1);
});
