#!/usr/bin/env node
/**
 * Phase 72 - AST Analysis Status Monitor
 *
 * Monitors AST analysis progress and triggers RAG/KAG pipeline when complete
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KB_FILE = path.join(__dirname, '..', 'reports', 'latest', 'project-knowledge-base.tree.json');
const CHECK_INTERVAL = 5000; // 5 seconds

console.log('🔍 Phase 72 - AST Analysis Status Monitor\n');
console.log('Waiting for AST analysis to complete...');
console.log(`Checking: ${KB_FILE}\n`);

let lastSize = 0;
let stableCount = 0;

const checkStatus = () => {
	if (!fs.existsSync(KB_FILE)) {
		process.stdout.write('\r⏳ AST analysis not started yet...'.padEnd(80));
		return false;
	}

	const stats = fs.statSync(KB_FILE);
	const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

	if (stats.size === lastSize) {
		stableCount++;
		if (stableCount >= 3) {
			// File size stable for 15 seconds - assume complete
			console.log(`\n\n✅ AST Analysis Complete!`);
			console.log(`   File: project-knowledge-base.tree.json`);
			console.log(`   Size: ${sizeMB} MB`);
			console.log(`   Last Modified: ${stats.mtime.toLocaleString()}\n`);

			// Try to read and show summary
			try {
				const kb = JSON.parse(fs.readFileSync(KB_FILE, 'utf-8'));
				console.log('📊 Knowledge Base Summary:');
				console.log(`   Nodes: ${kb.graph?.nodes?.length || 0}`);
				console.log(`   Edges: ${kb.graph?.edges?.length || 0}`);
				console.log(`   Clusters: ${kb.clusters?.length || 0}\n`);
			} catch (e) {
				console.log('⚠️  Could not parse KB file\n');
			}

			console.log('🚀 Ready to run RAG/KAG pipeline!');
			console.log('\nNext steps:');
			console.log('  1. Run: ./PHASE72-QUICKSTART.bat');
			console.log('  2. Or manually:');
			console.log('     node scripts/rag-kag-ast-integrator.mjs --auto-recommendations\n');

			return true;
		}
	} else {
		stableCount = 0;
	}

	lastSize = stats.size;
	process.stdout.write(`\r⏳ AST analysis in progress... (${sizeMB} MB, modified ${Math.floor((Date.now() - stats.mtime.getTime()) / 1000)}s ago)`.padEnd(80));

	return false;
};

// Initial check
if (checkStatus()) {
	process.exit(0);
}

// Poll for changes
const interval = setInterval(() => {
	if (checkStatus()) {
		clearInterval(interval);
		process.exit(0);
	}
}, CHECK_INTERVAL);

// Handle Ctrl+C
process.on('SIGINT', () => {
	console.log('\n\n⏸️  Monitoring stopped\n');
	clearInterval(interval);
	process.exit(0);
});
