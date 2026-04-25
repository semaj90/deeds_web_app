#!/usr/bin/env node
/**
 * Phase 77: Master Training Data Generator
 *
 * Runs all extractors and combines into final dataset:
 * 1. Svelte docs (relaxed matching) → 80-200 examples
 * 2. TypeScript enhanced (fail-open) → 200 examples
 * 3. Full-stack patterns (existing) → 32 examples
 * 4. Multi-language (WebGPU/CUDA/Go/Python/C++) → 250 examples
 *
 * Total expected: 500-700 examples
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TRAINING_DATA_DIR = path.join(rootDir, 'training-data');
const FINAL_OUTPUT = path.join(TRAINING_DATA_DIR, 'phase77-master-dataset.jsonl');

/**
 * Run script and capture output
 */
function runScript(scriptPath, description) {
	console.log(`\n${'='.repeat(60)}`);
	console.log(`🚀 Running: ${description}`);
	console.log(`${'='.repeat(60)}\n`);

	try {
		execSync(`node "${scriptPath}"`, {
			cwd: rootDir,
			stdio: 'inherit',
		});
		return true;
	} catch (error) {
		console.error(`\n❌ ${description} failed:`, error.message);
		return false;
	}
}

/**
 * Combine all JSONL files
 */
async function combineDatasets() {
	const files = [
		'svelte5-official-docs.jsonl',
		'typescript-enhanced.jsonl',
		'fullstack-training-combined.jsonl',
		'multilang-patterns.jsonl',
	];

	let allExamples = [];
	const stats = {};

	for (const file of files) {
		const filePath = path.join(TRAINING_DATA_DIR, file);
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			const lines = content.split('\n').filter(l => l.trim());
			const examples = lines.map(l => JSON.parse(l));

			allExamples.push(...examples);
			stats[file] = examples.length;

			console.log(`   ✅ ${file.padEnd(40)} ${examples.length.toString().padStart(4)} examples`);
		} catch (error) {
			console.log(`   ⚠️  ${file.padEnd(40)} not found`);
			stats[file] = 0;
		}
	}

	return { allExamples, stats };
}

/**
 * Generate quality report
 */
function analyzeQuality(examples) {
	const categories = {};
	const tags = {};
	let totalTokens = 0;

	examples.forEach(ex => {
		// Count categories
		const cat = ex.metadata?.category || 'uncategorized';
		categories[cat] = (categories[cat] || 0) + 1;

		// Count tags
		if (ex.metadata?.tags) {
			ex.metadata.tags.forEach(tag => {
				tags[tag] = (tags[tag] || 0) + 1;
			});
		}

		// Estimate tokens
		const text = JSON.stringify(ex.messages);
		totalTokens += Math.ceil(text.length / 4);
	});

	return {
		categories,
		tags,
		avgTokens: Math.round(totalTokens / examples.length),
		totalTokens,
	};
}

/**
 * Main execution
 */
async function main() {
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║  Phase 77: Master Training Data Generation                ║');
	console.log('╚═══════════════════════════════════════════════════════════╝\n');

	const startTime = Date.now();

	// Run all extractors
	const scripts = [
		{
			path: path.join(__dirname, 'phase77-extract-svelte-docs.mjs'),
			name: 'Svelte 5 Official Docs',
		},
		{
			path: path.join(__dirname, 'phase77-extract-typescript-enhanced.mjs'),
			name: 'TypeScript Enhanced Patterns',
		},
		{
			path: path.join(__dirname, 'phase77-generate-fullstack-training.mjs'),
			name: 'Full-Stack Integration Patterns',
		},
		{
			path: path.join(__dirname, 'phase77-extract-multilang.mjs'),
			name: 'Multi-Language Patterns (WebGPU/CUDA/Go/Python/C++)',
		},
	];

	const results = [];
	for (const script of scripts) {
		const success = runScript(script.path, script.name);
		results.push({ name: script.name, success });
	}

	// Combine datasets
	console.log('\n' + '='.repeat(60));
	console.log('📦 Combining datasets...\n');

	const { allExamples, stats } = await combineDatasets();

	// Analyze quality
	const quality = analyzeQuality(allExamples);

	// Write master dataset
	await fs.writeFile(
		FINAL_OUTPUT,
		allExamples.map(ex => JSON.stringify(ex)).join('\n')
	);

	// Write metadata
	const metadata = {
		timestamp: new Date().toISOString(),
		totalExamples: allExamples.length,
		sourceFiles: stats,
		quality,
		extractors: results,
		generationTimeMs: Date.now() - startTime,
	};

	await fs.writeFile(
		path.join(TRAINING_DATA_DIR, 'phase77-metadata.json'),
		JSON.stringify(metadata, null, 2)
	);

	// Final report
	console.log('\n' + '╔═══════════════════════════════════════════════════════════╗');
	console.log('║  Phase 77 Master Dataset Complete                         ║');
	console.log('╚═══════════════════════════════════════════════════════════╝\n');

	console.log(`📊 Total Examples:     ${allExamples.length}`);
	console.log(`⏱️  Generation Time:    ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
	console.log(`📦 Dataset Size:       ${((allExamples.length * quality.avgTokens * 4) / 1024).toFixed(1)} KB`);
	console.log(`🎯 Avg Tokens/Example: ${quality.avgTokens}`);

	console.log('\n📁 Source Breakdown:');
	Object.entries(stats).forEach(([file, count]) => {
		const pct = ((count / allExamples.length) * 100).toFixed(1);
		console.log(`   ${file.replace('.jsonl', '').padEnd(35)} ${count.toString().padStart(4)} (${pct}%)`);
	});

	console.log('\n📂 Top Categories:');
	Object.entries(quality.categories)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.forEach(([cat, count]) => {
			const pct = ((count / allExamples.length) * 100).toFixed(1);
			console.log(`   ${cat.padEnd(30)} ${count.toString().padStart(4)} (${pct}%)`);
		});

	console.log('\n🏷️  Top Tags:');
	Object.entries(quality.tags)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 15)
		.forEach(([tag, count]) => {
			console.log(`   ${tag.padEnd(20)} ${count.toString().padStart(4)}`);
		});

	console.log('\n📄 Output Files:');
	console.log(`   Master dataset:  ${FINAL_OUTPUT}`);
	console.log(`   Metadata:        ${path.join(TRAINING_DATA_DIR, 'phase77-metadata.json')}`);

	console.log('\n✅ Extractor Results:');
	results.forEach(r => {
		console.log(`   ${r.success ? '✅' : '❌'} ${r.name}`);
	});

	console.log('\n🚀 Next Steps:');
	console.log('   1. Review quality: cat training-data/phase77-metadata.json');
	console.log('   2. Merge with existing: cat training-data/combined_training_data.jsonl training-data/phase77-master-dataset.jsonl > complete-dataset.jsonl');
	console.log('   3. Upload to Google Colab for fine-tuning');
	console.log('   4. Train gemma-3-legal with full-stack context!\n');
}

main().catch(console.error);
