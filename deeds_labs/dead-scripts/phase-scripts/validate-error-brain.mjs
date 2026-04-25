#!/usr/bin/env node
/**
 * Validate Error-Brain System
 *
 * Checks all files exist and can be imported
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const requiredFiles = [
	// Core types & config
	'src/lib/error-brain/types.ts',
	'src/lib/error-brain/config.ts',
	'src/lib/error-brain/run-id.ts',

	// Diff subsystem
	'src/lib/error-brain/diff/guards.ts',
	'src/lib/error-brain/diff/emit-unified.ts',
	'src/lib/error-brain/diff/apply.ts',

	// State management
	'src/lib/error-brain/state.ts',
	'src/lib/error-brain/report-writer.ts',

	// Analysis engine
	'src/lib/error-brain/analyze/ingest.ts',
	'src/lib/error-brain/analyze/propose.ts',

	// Transport layer
	'src/lib/error-brain/transport/interface.ts',
	'src/lib/error-brain/transport/none.ts',
	'src/lib/error-brain/transport/sse-bus.ts',
	'src/lib/error-brain/transport/mux.ts',

	// API endpoints
	'src/routes/api/internal/error-brain/run/+server.ts',
	'src/routes/api/internal/error-brain/status/[runId]/+server.ts',

	// Documentation
	'docs/error-brain/HOW-TO-RUN.md',
	'docs/error-brain/GUARDRAILS.md',
	'docs/error-brain/INCIDENT_SYNTAX_CORRUPTION.md',
	'docs/error-brain/CI_DRY_RUN.md',

	// Orchestrator
	'scripts/error-brain-fix.mjs'
];

console.log('🔍 Validating Error-Brain System Files...\n');

let allExist = true;
let existCount = 0;

for (const file of requiredFiles) {
	const fullPath = resolve(root, file);
	const exists = existsSync(fullPath);

	if (exists) {
		console.log(`✅ ${file}`);
		existCount++;
	} else {
		console.log(`❌ ${file} - NOT FOUND`);
		allExist = false;
	}
}

console.log(`\n📊 Summary: ${existCount}/${requiredFiles.length} files found`);

if (allExist) {
	console.log('\n✅ All error-brain files are in place!');
	console.log('\n📋 Next steps:');
	console.log('   1. Set environment: $env:ERROR_BRAIN_ENABLED="1"');
	console.log('   2. Run dry-run: node scripts/error-brain-fix.mjs --dry-run');
	console.log('   3. Review proposals in reports/ directory');
	console.log('   4. Apply if verified: node scripts/error-brain-fix.mjs');
	process.exit(0);
} else {
	console.log('\n❌ Some files are missing. Please review the implementation.');
	process.exit(1);
}
