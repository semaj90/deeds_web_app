#!/usr/bin/env node
/**
 * Phase 78 + Task 3: Triple Execution Script (CLI Version)
 *
 * Executes three parallel operations via CLI commands:
 * 1. Re-run Phase 78 pipeline (collect → cluster → embed → suggest)
 * 2. Query and log existing patches
 * 3. Identify test files needing Task 3 updates
 *
 * Logs all results to reports/triple-execution-results.json
 */

import { execSync } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

const RESULTS_LOG = 'reports/triple-execution-results.json';

/**
 * @typedef {Object} ExecutionResults
 * @property {string} timestamp
 * @property {Object} phase78Pipeline
 * @property {string} phase78Pipeline.status
 * @property {string} phase78Pipeline.output
 * @property {number} phase78Pipeline.duration
 * @property {Object} patchQuery
 * @property {string} patchQuery.status
 * @property {number} patchQuery.totalPatches
 * @property {number} patchQuery.pendingPatches
 * @property {number} patchQuery.duration
 * @property {Object} task3Scan
 * @property {number} task3Scan.totalTestFiles
 * @property {number} task3Scan.filesNeedingUpdate
 * @property {number} task3Scan.duration
 */

function execCommand(command, description) {
	console.log(`\n⏳ ${description}...`);
	const startTime = Date.now();
	try {
		const output = execSync(command, {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
			maxBuffer: 10 * 1024 * 1024
		});
		const duration = Date.now() - startTime;
		console.log(`✅ Complete (${(duration / 1000).toFixed(2)}s)`);
		return { success: true, output, duration };
	} catch (error) {
		const duration = Date.now() - startTime;
		console.log(`❌ Failed (${(duration / 1000).toFixed(2)}s)`);
		return { success: false, error: error.message, output: error.stdout?.toString() || '', duration };
	}
}

async function main() {
	console.log('╔═══════════════════════════════════════════════════════╗');
	console.log('║  🚀 TRIPLE EXECUTION: Phase 78 + Task 3 + Patches  ║');
	console.log('╚═══════════════════════════════════════════════════════╝\n');

	/** @type {ExecutionResults} */
	const results = {
		timestamp: new Date().toISOString(),
		phase78Pipeline: { status: 'pending', output: '', duration: 0 },
		patchQuery: { status: 'pending', totalPatches: 0, pendingPatches: 0, duration: 0 },
		task3Scan: { totalTestFiles: 0, filesNeedingUpdate: 0, duration: 0 }
	};

	// ═══════════════════════════════════════════════════════════════
	// TASK 1: Re-run Phase 78 Pipeline
	// ═══════════════════════════════════════════════════════════════
	console.log('\n📊 TASK 1: Phase 78 Pipeline');
	console.log('─'.repeat(60));

	const phase78Start = Date.now();

	// Step 1: Collect errors
	const collect = execCommand(
		'npx tsx scripts/phase78-collect-errors.mts',
		'Collecting TypeScript errors'
	);

	if (collect.success) {
		// Step 2: Cluster errors
		const cluster = execCommand(
			'npx tsx scripts/phase78-cluster-errors.mts',
			'Clustering errors'
		);

		if (cluster.success) {
			// Step 3: Generate embeddings
			const embed = execCommand(
				'npx tsx scripts/phase78-embed-clusters.mts',
				'Generating 768d embeddings'
			);

			if (embed.success) {
				// Step 4: Generate AI suggestions
				const suggest = execCommand(
					'npx tsx scripts/phase78-generate-suggestions.mts',
					'Generating AI fix suggestions'
				);

				results.phase78Pipeline = {
					status: suggest.success ? 'complete' : 'partial',
					output: `Collect: ${collect.success}\nCluster: ${cluster.success}\nEmbed: ${embed.success}\nSuggest: ${suggest.success}`,
					duration: Date.now() - phase78Start
				};
			} else {
				results.phase78Pipeline = { status: 'failed_at_embed', output: embed.error, duration: Date.now() - phase78Start };
			}
		} else {
			results.phase78Pipeline = { status: 'failed_at_cluster', output: cluster.error, duration: Date.now() - phase78Start };
		}
	} else {
		results.phase78Pipeline = { status: 'failed_at_collect', output: collect.error, duration: Date.now() - phase78Start };
	}

	// ═══════════════════════════════════════════════════════════════
	// TASK 2: Query Existing Patches
	// ═══════════════════════════════════════════════════════════════
	console.log('\n\n📦 TASK 2: Query Existing Patches');
	console.log('─'.repeat(60));

	const patchStart = Date.now();

	const queryPatches = execCommand(
		'npx tsx -e "import { db } from \'./src/lib/server/db/drizzle.js\'; import { errorSuggestions } from \'./src/lib/db/schema/legacy.js\'; const patches = await db.select().from(errorSuggestions); console.log(JSON.stringify({ total: patches.length, pending: patches.filter(p => !p.applied).length })); process.exit(0);"',
		'Querying patches from database'
	);

	if (queryPatches.success) {
		try {
			const patchData = JSON.parse(queryPatches.output.trim());
			results.patchQuery = {
				status: 'complete',
				totalPatches: patchData.total,
				pendingPatches: patchData.pending,
				duration: Date.now() - patchStart
			};
			console.log(`\n   📊 Total patches: ${patchData.total}`);
			console.log(`   ⏳ Pending: ${patchData.pending}`);
			console.log(`   ✅ Applied: ${patchData.total - patchData.pending}`);
			console.log(`\n   🌐 Apply patches at: http://localhost:5175/phase78/patches`);
		} catch (error) {
			results.patchQuery = { status: 'parse_error', totalPatches: 0, pendingPatches: 0, duration: Date.now() - patchStart };
		}
	} else {
		results.patchQuery = { status: 'query_failed', totalPatches: 0, pendingPatches: 0, duration: Date.now() - patchStart };
	}

	// ═══════════════════════════════════════════════════════════════
	// TASK 3: Scan Test Files
	// ═══════════════════════════════════════════════════════════════
	console.log('\n\n🧪 TASK 3: Test File Scan');
	console.log('─'.repeat(60));

	const scanStart = Date.now();

	const scanTests = execCommand(
		'powershell -NoProfile -Command "$total = (Get-ChildItem -Recurse -Filter \'*.test.ts\' | Measure-Object).Count; $needsUpdate = (Get-ChildItem -Recurse -Filter \'*.test.ts\' | Select-String -Pattern \'setupTest\' -NotMatch | Measure-Object).Count; @{ total = $total; needsUpdate = $needsUpdate } | ConvertTo-Json"',
		'Scanning test files for Task 3 updates'
	);

	if (scanTests.success) {
		try {
			const testData = JSON.parse(scanTests.output.trim());
			results.task3Scan = {
				totalTestFiles: testData.total,
				filesNeedingUpdate: testData.needsUpdate,
				duration: Date.now() - scanStart
			};
			console.log(`\n   📊 Total test files: ${testData.total}`);
			console.log(`   ⏳ Need mock infrastructure: ${testData.needsUpdate}`);
			console.log(`   ✅ Already updated: ${testData.total - testData.needsUpdate}`);
			console.log(`\n   📝 Pattern: Import setupTest/cleanupTest from test-utils/setup`);
			console.log(`      Reference: src/lib/agents/__tests__/rag-lookup.test.ts`);
		} catch (error) {
			results.task3Scan = { totalTestFiles: 0, filesNeedingUpdate: 0, duration: Date.now() - scanStart };
		}
	} else {
		results.task3Scan = { totalTestFiles: 0, filesNeedingUpdate: 0, duration: Date.now() - scanStart };
	}

	// ═══════════════════════════════════════════════════════════════
	// Save Results
	// ═══════════════════════════════════════════════════════════════
	console.log('\n\n💾 Saving Results');
	console.log('─'.repeat(60));

	try {
		await mkdir(dirname(RESULTS_LOG), { recursive: true });
		await writeFile(RESULTS_LOG, JSON.stringify(results, null, 2));
		console.log(`✅ Results saved to: ${RESULTS_LOG}`);
	} catch (error) {
		console.log(`❌ Failed to save results: ${error.message}`);
	}

	// ═══════════════════════════════════════════════════════════════
	// Summary
	// ═══════════════════════════════════════════════════════════════
	console.log('\n\n╔═══════════════════════════════════════════════════════╗');
	console.log('║                  EXECUTION SUMMARY                    ║');
	console.log('╚═══════════════════════════════════════════════════════╝');

	console.log(`\n   🔄 Phase 78 Pipeline: ${results.phase78Pipeline.status.toUpperCase()}`);
	console.log(`      Duration: ${(results.phase78Pipeline.duration / 1000).toFixed(2)}s`);

	console.log(`\n   📦 Patch Query: ${results.patchQuery.status.toUpperCase()}`);
	console.log(`      Total: ${results.patchQuery.totalPatches} | Pending: ${results.patchQuery.pendingPatches}`);

	console.log(`\n   🧪 Test File Scan: COMPLETE`);
	console.log(`      Files needing update: ${results.task3Scan.filesNeedingUpdate}/${results.task3Scan.totalTestFiles}`);

	console.log('\n\n📍 Next Steps:');
	console.log(`   1. Review results: ${RESULTS_LOG}`);
	console.log(`   2. Apply patches: http://localhost:5175/phase78/patches`);
	console.log(`   3. Update test files: Use pattern from rag-lookup.test.ts\n`);
}

main().catch(console.error);
