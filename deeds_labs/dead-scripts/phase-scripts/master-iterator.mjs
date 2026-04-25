#!/usr/bin/env node

/**
 * Master Iterator
 * Runs Phases 72, 78, and 82 in a continuous improvement loop.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function run(cmd, args, name) {
	return new Promise((resolve, reject) => {
		console.log(`\n🚀 Starting ${name}...`);
		console.log(`> ${cmd} ${args.join(' ')}`);

		const proc = spawn(cmd, args, {
			stdio: 'inherit',
			shell: true,
			cwd: ROOT
		});

		proc.on('close', (code) => {
			if (code === 0) {
				console.log(`✅ ${name} complete.`);
				resolve();
			} else {
				console.error(`❌ ${name} failed with code ${code}`);
				reject(new Error(`${name} failed`));
			}
		});
	});
}

async function main() {
	console.log('╔══════════════════════════════════════════════════════╗');
	console.log('║             YoRHa Continuous Improvement             ║');
	console.log('║             Phases 72 → 78 → 82 Loop                 ║');
	console.log('╚══════════════════════════════════════════════════════╝\n');

	try {
		// Phase 72: Error Detection & Fixing Loop
		console.log('--- PHASE 72: ERROR BRAIN ---');
		await run('npm', ['run', 'phase72:auto-iterate'], 'Phase 72 Auto-Iterate');

		// Phase 78: Analysis & Summarization
		console.log('\n--- PHASE 78: AST BRAIN ---');
		// Set cycle env var for tracking
		process.env.PHASE72_CYCLE = '1';
		await run('node', ['scripts/phase78-brain-pass.mjs'], 'Phase 78 Brain Pass');

		// Phase 82: Upgrades (Svelte 5)
		console.log('\n--- PHASE 82: UPGRADE BRAIN ---');
		// We run this in "check" mode first or on a specific route to avoid breaking everything
		// For now, let's just run the validator to see status
		await run('node', ['scripts/validate-svelte5-compliance.mjs'], 'Svelte 5 Compliance Check');

		console.log('\n✨ Iteration Cycle Complete! ✨');
		console.log('Check the Admin UI for results: http://127.0.0.1:5173/ast_graph_error_analysis');

	} catch (err) {
		console.error('\n❌ Iteration failed:', err.message);
		process.exit(1);
	}
}

main();
