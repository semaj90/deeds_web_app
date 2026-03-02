#!/usr/bin/env node
/**
 * Test /api/agent/investigate endpoint with Enhanced Detective Mode scenarios
 *
 * Tests the 5 enhanced detective mode investigation patterns:
 * 1. TODO Management & Prioritization
 * 2. Database Schema Analysis
 * 3. Training Dataset Inventory
 * 4. API Endpoint Mapping
 * 5. Infrastructure Health Status
 *
 * Usage:
 *   # Test all scenarios
 *   node scripts/tests/test-agent-investigate.mjs
 *
 *   # Test specific scenario
 *   node scripts/tests/test-agent-investigate.mjs --scenario todo
 *
 *   # Verbose output with tool call details
 *   node scripts/tests/test-agent-investigate.mjs --verbose
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';

const API_URL = process.env.API_URL || 'http://localhost:5173';
const OUTPUT_DIR = './scripts/tests/agent-investigate-results';

// Enhanced Detective Mode Test Scenarios
const SCENARIOS = {
	todo: {
		name: 'TODO Management & Prioritization',
		query: 'Find all TODO comments and organize by priority with effort estimates',
		expectedTools: ['ripgrep_search', 'extract_pattern', 'analyze_file'],
		expectedFindings: [
			'87 TODOs across 7 categories',
			'CRITICAL (< 2hr)',
			'HIGH (2-10hr)',
			'MEDIUM (10-40hr)',
			'~204 hours total',
			'4-phase roadmap'
		]
	},
	database: {
		name: 'Database Schema Analysis',
		query: 'Review drizzle migrations for dangerous DROP TABLE statements and recommend safe alternatives',
		expectedTools: ['find_files', 'ripgrep_search', 'analyze_file', 'web_search'],
		expectedFindings: [
			'DROP TABLE CASCADE',
			'drizzle/0002_flaky_midnight.sql',
			'ALTER TABLE RENAME',
			'schema-postgres.ts',
			'70+ tables',
			'additive-only'
		]
	},
	ml: {
		name: 'Training Dataset Inventory',
		query: 'How many training datasets exist, what is our multimodal status, and what infrastructure is missing?',
		expectedTools: ['find_files', 'analyze_file', 'web_search'],
		expectedFindings: [
			'38 JSONL datasets',
			'102.5K examples',
			'prepare_colab_datasets.py',
			'multimodal',
			'YOLO',
			'Whisper',
			'CLIP',
			'evaluation',
			'A/B testing',
			'TensorRT'
		]
	},
	api: {
		name: 'API Endpoint Mapping',
		query: 'Map all API endpoints, find broken routes returning 500 errors, and identify missing implementations',
		expectedTools: ['find_files', 'ripgrep_search', 'analyze_file'],
		expectedFindings: [
			'175+ endpoints',
			'25 categories',
			'api-registry.ts',
			'template generation',
			'500 error',
			'/api/reports/generate-from-template',
			'missing implementations'
		]
	},
	infra: {
		name: 'Infrastructure Health Status',
		query: 'Check Redis connection setup, verify if embeddings are persisted, and analyze Docker service status',
		expectedTools: ['find_files', 'analyze_file', 'ripgrep_search'],
		expectedFindings: [
			'redis.ts',
			'single connection',
			'connection pool',
			'embedding-worker.ts',
			'line 146',
			'persist',
			'pgvector',
			'Qdrant',
			'docker',
			'postgres',
			'test coverage'
		]
	}
};

/**
 * Test a single investigation scenario
 */
async function testScenario(scenarioKey, verbose = false) {
	const scenario = SCENARIOS[scenarioKey];
	const startTime = Date.now();

	console.log(`\n${'='.repeat(70)}`);
	console.log(`TESTING: ${scenario.name}`);
	console.log(`${'='.repeat(70)}`);
	console.log(`Query: "${scenario.query}"\n`);

	try {
		// Call investigation endpoint
		console.log('⏳ Sending request to /api/agent/investigate...');
		const response = await fetch(`${API_URL}/api/agent/investigate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				query: scenario.query,
				useACE: true,
				maxIterations: 15,
				verbose: verbose
			})
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(
				`HTTP ${response.status}: ${errorData.message || response.statusText}`
			);
		}

		const result = await response.json();
		const duration = Date.now() - startTime;

		// Analyze results
		console.log(`\n✓ Investigation completed in ${duration}ms`);
		console.log(`✓ Agent duration: ${result.duration}ms`);
		console.log(`✓ Tool calls: ${result.toolCalls?.length || 0}`);

		// Check tool usage
		const toolsUsed = new Set(result.toolCalls?.map((tc) => tc.tool) || []);
		const expectedTools = scenario.expectedTools;
		const toolMatch = expectedTools.filter((t) => toolsUsed.has(t));

		console.log(`\n📊 Tool Analysis:`);
		console.log(`  Expected tools: ${expectedTools.join(', ')}`);
		console.log(`  Tools used: ${Array.from(toolsUsed).join(', ')}`);
		console.log(`  Match: ${toolMatch.length}/${expectedTools.length} (${Math.round((toolMatch.length / expectedTools.length) * 100)}%)`);

		// Check answer quality
		const answer = result.answer || '';
		const findingsFound = scenario.expectedFindings.filter((finding) =>
			answer.toLowerCase().includes(finding.toLowerCase())
		);

		console.log(`\n📝 Answer Quality:`);
		console.log(`  Length: ${answer.length} characters`);
		console.log(`  Expected findings: ${scenario.expectedFindings.length}`);
		console.log(`  Findings present: ${findingsFound.length} (${Math.round((findingsFound.length / scenario.expectedFindings.length) * 100)}%)`);

		if (findingsFound.length < scenario.expectedFindings.length) {
			const missing = scenario.expectedFindings.filter(
				(f) => !findingsFound.includes(f)
			);
			console.log(`  Missing: ${missing.join(', ')}`);
		}

		// Show reasoning chain
		if (result.reasoning && result.reasoning.length > 0) {
			console.log(`\n🧠 Reasoning Chain (${result.reasoning.length} steps):`);
			result.reasoning.slice(0, 3).forEach((step, i) => {
				console.log(`  ${i + 1}. ${step.slice(0, 80)}${step.length > 80 ? '...' : ''}`);
			});
			if (result.reasoning.length > 3) {
				console.log(`  ... (${result.reasoning.length - 3} more steps)`);
			}
		}

		// Show tool calls details in verbose mode
		if (verbose && result.toolCalls && result.toolCalls.length > 0) {
			console.log(`\n🔧 Tool Call Details:`);
			result.toolCalls.forEach((tc, i) => {
				console.log(`  ${i + 1}. ${tc.tool} (${tc.duration}ms)`);
				console.log(`     Input: ${JSON.stringify(tc.input).slice(0, 100)}...`);
				console.log(
					`     Output: ${tc.output.slice(0, 100)}${tc.output.length > 100 ? '...' : ''}`
				);
			});
		}

		// Show answer preview
		console.log(`\n📄 Answer Preview:`);
		const preview = answer.split('\n').slice(0, 10).join('\n');
		console.log(preview);
		if (answer.split('\n').length > 10) {
			console.log(`... (${answer.split('\n').length - 10} more lines)`);
		}

		// Save full result to file
		if (!existsSync(OUTPUT_DIR)) {
			await mkdir(OUTPUT_DIR, { recursive: true });
		}

		const outputFile = `${OUTPUT_DIR}/${scenarioKey}-${Date.now()}.json`;
		await writeFile(outputFile, JSON.stringify(result, null, 2), 'utf-8');
		console.log(`\n💾 Full result saved: ${outputFile}`);

		// Overall pass/fail
		const toolScore = (toolMatch.length / expectedTools.length) * 100;
		const findingsScore = (findingsFound.length / scenario.expectedFindings.length) * 100;
		const overallScore = (toolScore + findingsScore) / 2;

		console.log(`\n🎯 Overall Score: ${Math.round(overallScore)}%`);
		if (overallScore >= 70) {
			console.log(`✅ PASS — Investigation successful`);
			return { scenario: scenarioKey, passed: true, score: overallScore, duration };
		} else {
			console.log(`❌ FAIL — Investigation incomplete (expected 70%+ score)`);
			return { scenario: scenarioKey, passed: false, score: overallScore, duration };
		}
	} catch (err) {
		const duration = Date.now() - startTime;
		console.error(`\n❌ ERROR: ${err.message}`);
		if (verbose && err.stack) {
			console.error(err.stack);
		}
		return { scenario: scenarioKey, passed: false, error: err.message, duration };
	}
}

/**
 * Main test runner
 */
async function main() {
	const args = process.argv.slice(2);
	const scenario = args.find((a) => a.startsWith('--scenario='))?.split('=')[1];
	const verbose = args.includes('--verbose') || args.includes('-v');

	console.log('=' .repeat(70));
	console.log('ENHANCED DETECTIVE MODE INVESTIGATION TESTS');
	console.log('='.repeat(70));
	console.log(`API URL: ${API_URL}`);
	console.log(`Output: ${OUTPUT_DIR}`);
	console.log(`Verbose: ${verbose ? 'enabled' : 'disabled'}`);

	// Test specific scenario or all
	const scenariosToTest = scenario
		? [scenario]
		: Object.keys(SCENARIOS);

	const results = [];

	for (const key of scenariosToTest) {
		if (!SCENARIOS[key]) {
			console.error(`\n❌ Unknown scenario: ${key}`);
			console.error(`Available: ${Object.keys(SCENARIOS).join(', ')}`);
			continue;
		}

		const result = await testScenario(key, verbose);
		results.push(result);

		// Brief pause between tests
		if (scenariosToTest.length > 1) {
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}

	// Summary
	console.log(`\n${'='.repeat(70)}`);
	console.log('TEST SUMMARY');
	console.log('='.repeat(70));

	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;
	const total = results.length;

	results.forEach((r) => {
		const status = r.passed ? '✅ PASS' : '❌ FAIL';
		const score = r.score ? `(${Math.round(r.score)}%)` : '';
		const duration = r.duration ? `${r.duration}ms` : '';
		const error = r.error ? `— ${r.error}` : '';
		console.log(`${status} ${SCENARIOS[r.scenario].name} ${score} ${duration} ${error}`);
	});

	console.log(`\nTotal: ${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`);

	// Exit code
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
