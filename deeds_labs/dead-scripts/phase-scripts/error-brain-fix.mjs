#!/usr/bin/env node
/**
 * Error Brain: Syntax Corruption Fix Orchestrator v2
 *
 * P0 Incident: Treat syntax corruption with deterministic, idempotent fixes.
 * Uses error-brain infrastructure (Tasks 15-36).
 *
 * Usage:
 *   node error-brain-fix.mjs --dry-run   # Propose patches only
 *   node error-brain-fix.mjs             # Apply patches (requires confirmation)
 *   node error-brain-fix.mjs --force     # Apply without confirmation
 *
 * Environment:
 *   ERROR_BRAIN_ENABLED=1       # Required
 *   ERROR_BRAIN_APPLY_MODE=off  # safe | full (default: off)
 *   BATCH_REPORT_STAMP=...      # Optional: deterministic timestamp
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestErrors } from '../src/lib/error-brain/analyze/ingest.js';
import { generateProposals } from '../src/lib/error-brain/analyze/propose.js';
import { ERROR_BRAIN_CONFIG } from '../src/lib/error-brain/config.js';
import { applyPatches } from '../src/lib/error-brain/diff/apply.js';
import { writeIncidentReport, writeRunProgress } from '../src/lib/error-brain/report-writer.js';
import { generateRunId } from '../src/lib/error-brain/run-id.js';
import { initRunProgress, updateRunProgress } from '../src/lib/error-brain/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const TSCONFIG_PATH = resolve(PROJECT_ROOT, 'tsconfig.check.json');

/** Parse command-line arguments */
function parseArgs() {
	const args = process.argv.slice(2);
	return {
		dryRun: args.includes('--dry-run'),
		force: args.includes('--force')
	};
}

/** Validate environment and configuration */
function validateEnvironment() {
	// Check if error-brain is enabled
	if (!ERROR_BRAIN_CONFIG.enabled) {
		console.error('❌ ERROR_BRAIN_ENABLED=1 required');
		process.exit(1);
	}

	// Check if tsconfig exists
	if (!existsSync(TSCONFIG_PATH)) {
		console.error(`❌ tsconfig not found: ${TSCONFIG_PATH}`);
		process.exit(1);
	}

	console.log('✅ Environment validated');
	console.log(`   - Apply mode: ${ERROR_BRAIN_CONFIG.applyMode}`);
	console.log(`   - Transport: ${ERROR_BRAIN_CONFIG.transport}`);
	console.log(`   - Report stamp: ${ERROR_BRAIN_CONFIG.batchReportStamp}`);
}

/** Main orchestration */
async function main() {
	const { dryRun, force } = parseArgs();

	console.log('🧠 Error Brain: Syntax Corruption Fix v2');
	console.log('========================================\n');

	validateEnvironment();

	// Generate run ID
	const runId = generateRunId();
	console.log(`📋 Run ID: ${runId}\n`);

	// Initialize run state
	initRunProgress(runId);
	updateRunProgress(runId, { step: 'started' });
	await writeRunProgress(runId);

	try {
		// Step 1: Ingest errors
		console.log('🔍 Step 1: Ingesting TypeScript errors...');
		updateRunProgress(runId, { step: 'ingesting' });
		await writeRunProgress(runId);

		const errorRecords = ingestErrors(TSCONFIG_PATH, PROJECT_ROOT);
		console.log(`   Found ${errorRecords.length} actionable errors\n`);

		updateRunProgress(runId, {
			counters: { errorsFound: errorRecords.length }
		});
		await writeRunProgress(runId);

		// Step 2: Generate proposals
		console.log('💡 Step 2: Generating patch proposals...');
		updateRunProgress(runId, { step: 'proposing' });
		await writeRunProgress(runId);

		const candidates = generateProposals(errorRecords, PROJECT_ROOT);
		console.log(`   Proposed ${candidates.length} patches\n`);

		updateRunProgress(runId, {
			candidates,
			counters: { patchesProposed: candidates.length }
		});
		await writeRunProgress(runId);

		// Step 3: Show proposals
		if (candidates.length === 0) {
			console.log('✅ No patches to apply');
			updateRunProgress(runId, { step: 'done' });
			await writeRunProgress(runId);
			return;
		}

		console.log('📝 Proposed patches:\n');
		for (const candidate of candidates) {
			console.log(`   ${candidate.targetFile}`);
			console.log(`      Confidence: ${candidate.confidence}`);
			console.log(`      Delta: +${candidate.lineDelta.added} -${candidate.lineDelta.removed}`);
			console.log(`      Notes: ${candidate.notes.join(', ')}\n`);
		}

		// Step 4: Apply patches (if not dry-run)
		if (dryRun) {
			console.log('🔒 Dry run mode - patches not applied');
			console.log(`📊 Review proposals in: reports/runs/${runId}.json\n`);
			updateRunProgress(runId, { step: 'done' });
			await writeRunProgress(runId);
			return;
		}

		// Confirmation prompt (unless --force)
		if (!force) {
			console.log('⚠️  About to apply patches. Continue? (y/N)');
			// Simple prompt using stdin (works in both Node REPL and terminal)
			const readline = (await import('node:readline')).default;
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			});

			const answer = await new Promise<string>((resolve) => {
				rl.question('', (ans) => {
					rl.close();
					resolve(ans);
				});
			});

			if (answer.toLowerCase() !== 'y') {
				console.log('❌ Aborted by user\n');
				updateRunProgress(runId, { step: 'done' });
				await writeRunProgress(runId);
				return;
			}
		}

		console.log('🚀 Step 3: Applying patches...');
		updateRunProgress(runId, { step: 'applying' });
		await writeRunProgress(runId);

		const applyResult = await applyPatches(candidates, runId, false);
		console.log(`   Applied: ${applyResult.applied.length}`);
		console.log(`   Rejected: ${applyResult.rejected.length}\n`);

		updateRunProgress(runId, {
			counters: {
				patchesApplied: applyResult.applied.length,
				patchesRejected: applyResult.rejected.length
			}
		});

		// Step 5: Write incident report
		console.log('📄 Step 4: Writing incident report...');
		await writeIncidentReport(runId, errorRecords, candidates, applyResult);
		console.log('   Report written\n');

		updateRunProgress(runId, { step: 'done' });
		await writeRunProgress(runId);

		// Final summary
		console.log('✅ Syntax corruption fix complete');
		console.log(`📊 Reports: reports/runs/${runId}.json`);
		console.log(`📦 Patches: reports/patches/${ERROR_BRAIN_CONFIG.batchReportStamp}/${runId}/\n`);

		// Next steps
		if (applyResult.applied.length > 0) {
			console.log('🔍 Next steps:');
			console.log('   1. Run: npx tsc --noEmit --skipLibCheck -p tsconfig.check.json');
			console.log('   2. Verify: git diff');
			console.log('   3. Commit if verified\n');
		}
	} catch (error) {
		console.error('❌ Error during execution:', error);
		updateRunProgress(runId, {
			step: 'failed',
			lastError: error instanceof Error ? error.message : String(error)
		});
		await writeRunProgress(runId);
		process.exit(1);
	}
}

// Run
main().catch(console.error);
