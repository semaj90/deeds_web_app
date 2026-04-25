#!/usr/bin/env node
/**
 * Phase 87: Complete Pipeline Launcher
 *
 * Runs all Phase 87 components in sequence:
 * 1. Ingest error corpus → PostgreSQL + pgvector
 * 2. Create HNSW index for fast vector search
 * 3. Sync with Qdrant knowledge bases (Phase 66-85)
 * 4. Run autonomous fixer with pattern matching
 *
 * Prerequisites:
 * - PostgreSQL 17 + pgvector on port 5434
 * - Qdrant on port 6333
 * - Ollama embeddinggemma:latest on port 11434
 * - FastMCP agent server on port 3002
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCRIPTS = [
	{
		name: 'Error Corpus Ingestion',
		file: 'phase87-ingest-error-corpus.mjs',
		description: 'Load all TypeScript errors into PostgreSQL with pgvector embeddings'
	},
	{
		name: 'Knowledge Base Sync',
		file: 'phase87-knowledge-sync.mjs',
		description: 'Sync PostgreSQL with Qdrant and extract RAG/KAG patterns'
	},
	{
		name: 'Autonomous Fixer',
		file: 'phase87-autonomous-fixer.mjs',
		description: 'Run autonomous error fixing with vector-based pattern matching'
	}
];

async function runScript(scriptPath, name) {
	console.log('\n' + '='.repeat(80));
	console.log(`🚀 Running: ${name}`);
	console.log('='.repeat(80) + '\n');

	return new Promise((resolve, reject) => {
		const child = spawn('node', [scriptPath], {
			stdio: 'inherit',
			shell: true,
			cwd: path.dirname(scriptPath)
		});

		child.on('close', (code) => {
			if (code === 0) {
				console.log(`\n✅ ${name} completed successfully`);
				resolve();
			} else {
				console.error(`\n❌ ${name} failed with code ${code}`);
				reject(new Error(`Script failed: ${name}`));
			}
		});

		child.on('error', (err) => {
			console.error(`\n❌ Failed to start ${name}:`, err.message);
			reject(err);
		});
	});
}

async function main() {
	console.log('🎯 Phase 87: Complete Pipeline');
	console.log('=' .repeat(80));
	console.log('');
	console.log('Components:');
	SCRIPTS.forEach((s, i) => {
		console.log(`${i + 1}. ${s.name}`);
		console.log(`   ${s.description}`);
		console.log('');
	});

	const startTime = Date.now();

	try {
		for (const script of SCRIPTS) {
			const scriptPath = path.join(__dirname, script.file);
			await runScript(scriptPath, script.name);
		}

		const duration = ((Date.now() - startTime) / 1000).toFixed(1);

		console.log('\n' + '='.repeat(80));
		console.log('✅ Phase 87: Complete Pipeline Finished!');
		console.log('='.repeat(80));
		console.log(`Total time: ${duration}s`);
		console.log('');
		console.log('Results:');
		console.log('  - Error corpus ingested to PostgreSQL + pgvector');
		console.log('  - HNSW index created for fast vector search');
		console.log('  - Knowledge bases synced (PostgreSQL ↔ Qdrant)');
		console.log('  - Autonomous fixes applied with validation');
		console.log('');
		console.log('Check reports/ directory for detailed logs');
		console.log('=' .repeat(80));

	} catch (err) {
		console.error('\n❌ Pipeline failed:', err.message);
		process.exit(1);
	}
}

main();
