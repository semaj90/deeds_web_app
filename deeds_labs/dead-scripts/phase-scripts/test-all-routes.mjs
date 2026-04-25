#!/usr/bin/env node

/**
 * Comprehensive Route Testing Script
 * Tests all critical routes in the application
 */

const routes = [
	{ path: '/', name: 'Homepage' },
	{ path: '/all-routes', name: 'All Routes Dashboard' },
	{ path: '/command/routes', name: 'NES Command Center' },
	{ path: '/ast_graph_error_analysis', name: 'AST Graph Error Analysis' },
	{ path: '/cases', name: 'Cases List' },
	{ path: '/evidence', name: 'Evidence Library' },
	{ path: '/api/phase72/errors/summary', name: 'Phase 72 API - Error Summary' },
	{ path: '/api/phase72/errors?route=/test', name: 'Phase 72 API - Route Errors' },
	{ path: '/api/phase78/ast/graph', name: 'Phase 78 API - AST Graph' },
	{ path: '/api/phase82/status?route=/test', name: 'Phase 82 API - Status' },
	{ path: '/api/routes/all', name: 'Routes API' }
];

const baseUrl = 'http://127.0.0.1:5173';

async function testRoute(route) {
	const url = `${baseUrl}${route.path}`;
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(5000) // 5 second timeout
		});

		const status = response.status;
		const isSuccess = status >= 200 && status < 400;
		const icon = isSuccess ? '✅' : status === 404 ? '⚠️' : '❌';

		return {
			...route,
			status,
			success: isSuccess,
			icon
		};
	} catch (error) {
		return {
			...route,
			status: 'ERROR',
			success: false,
			icon: '❌',
			error: error.message
		};
	}
}

async function runTests() {
	console.log('🎮 Testing YoRHa Legal AI Routes...\n');
	console.log(`📡 Base URL: ${baseUrl}\n`);

	const results = [];

	for (const route of routes) {
		process.stdout.write(`Testing ${route.name}... `);
		const result = await testRoute(route);
		results.push(result);
		console.log(`${result.icon} ${result.status}`);
	}

	console.log('\n' + '='.repeat(60));
	console.log('📊 Test Summary\n');

	const passed = results.filter(r => r.success).length;
	const failed = results.filter(r => !r.success).length;

	console.log(`✅ Passed: ${passed}/${routes.length}`);
	console.log(`❌ Failed: ${failed}/${routes.length}`);

	if (failed > 0) {
		console.log('\n⚠️  Failed Routes:');
		results.filter(r => !r.success).forEach(r => {
			console.log(`  • ${r.name} (${r.path})`);
			console.log(`    Status: ${r.status}`);
			if (r.error) console.log(`    Error: ${r.error}`);
		});
	}

	console.log('\n' + '='.repeat(60));

	if (passed === routes.length) {
		console.log('\n🎉 All routes working! System is ready.\n');
		return true;
	} else {
		console.log('\n⚠️  Some routes need attention.\n');
		return false;
	}
}

runTests().then(success => {
	process.exit(success ? 0 : 1);
});
