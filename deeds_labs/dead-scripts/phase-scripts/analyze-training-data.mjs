#!/usr/bin/env node
/**
 * 📊 Phase 77: Training Dataset Analyzer
 *
 * Analyzes combined_training_data.jsonl for:
 * - Token distribution
 * - Instruction diversity
 * - Category coverage
 * - Output length statistics
 *
 * Usage:
 *   node scripts/analyze-training-data.mjs
 */

import chalk from 'chalk';
import fs from 'fs/promises';

const DATASET_FILE = 'combined_training_data.jsonl';

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text) {
	// GPT-style tokenization: ~1 token per 4 characters
	return Math.ceil(text.length / 4);
}

/**
 * Categorize by instruction keywords
 */
function categorize(instruction) {
	const lower = instruction.toLowerCase();

	if (lower.includes('$state') || lower.includes('$props') || lower.includes('$derived') || lower.includes('$effect')) {
		return 'svelte5_runes';
	}
	if (lower.includes('typescript') || lower.includes('type annotation')) {
		return 'typescript';
	}
	if (lower.includes('sveltekit') || lower.includes('load function') || lower.includes('form action')) {
		return 'sveltekit';
	}
	if (lower.includes('drizzle')) {
		return 'drizzle_orm';
	}
	if (lower.includes('unocss') || lower.includes('bits ui')) {
		return 'styling';
	}
	if (lower.includes('test') || lower.includes('vitest')) {
		return 'testing';
	}
	if (lower.includes('security') || lower.includes('csrf') || lower.includes('xss')) {
		return 'security';
	}
	if (lower.includes('deploy') || lower.includes('production')) {
		return 'deployment';
	}

	return 'other';
}

/**
 * Main analysis
 */
async function main() {
	console.log(chalk.cyan.bold('\n📊 Phase 77: Training Dataset Analysis\n'));

	// Read dataset
	const content = await fs.readFile(DATASET_FILE, 'utf-8');
	const lines = content.trim().split('\n');
	const examples = lines.map((line) => JSON.parse(line));

	console.log(chalk.white(`   Dataset: ${DATASET_FILE}`));
	console.log(chalk.white(`   Total examples: ${examples.length}\n`));

	// ============================================
	// Token Distribution
	// ============================================
	console.log(chalk.cyan('🔢 Token Distribution:\n'));

	const tokenCounts = examples.map((ex) => ({
		instruction: estimateTokens(ex.instruction),
		input: estimateTokens(ex.input),
		output: estimateTokens(ex.output),
		total: estimateTokens(ex.instruction + ex.input + ex.output)
	}));

	const avgTokens = {
		instruction: Math.round(tokenCounts.reduce((sum, t) => sum + t.instruction, 0) / examples.length),
		input: Math.round(tokenCounts.reduce((sum, t) => sum + t.input, 0) / examples.length),
		output: Math.round(tokenCounts.reduce((sum, t) => sum + t.output, 0) / examples.length),
		total: Math.round(tokenCounts.reduce((sum, t) => sum + t.total, 0) / examples.length)
	};

	const maxTokens = {
		instruction: Math.max(...tokenCounts.map((t) => t.instruction)),
		input: Math.max(...tokenCounts.map((t) => t.input)),
		output: Math.max(...tokenCounts.map((t) => t.output)),
		total: Math.max(...tokenCounts.map((t) => t.total))
	};

	console.log(chalk.white('   Average tokens per example:'));
	console.log(chalk.gray(`      Instruction: ${avgTokens.instruction}`));
	console.log(chalk.gray(`      Input: ${avgTokens.input}`));
	console.log(chalk.gray(`      Output: ${avgTokens.output}`));
	console.log(chalk.gray(`      Total: ${avgTokens.total}\n`));

	console.log(chalk.white('   Max tokens per example:'));
	console.log(chalk.gray(`      Instruction: ${maxTokens.instruction}`));
	console.log(chalk.gray(`      Input: ${maxTokens.input}`));
	console.log(chalk.gray(`      Output: ${maxTokens.output}`));
	console.log(chalk.gray(`      Total: ${maxTokens.total}\n`));

	// ============================================
	// Category Distribution
	// ============================================
	console.log(chalk.cyan('📁 Category Distribution:\n'));

	const categories = {};
	for (const ex of examples) {
		const cat = categorize(ex.instruction);
		categories[cat] = (categories[cat] || 0) + 1;
	}

	const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);

	for (const [cat, count] of sorted) {
		const percentage = ((count / examples.length) * 100).toFixed(1);
		const bar = '█'.repeat(Math.round(count / 2));
		console.log(chalk.white(`   ${cat.padEnd(20)} ${bar} ${count} (${percentage}%)`));
	}

	// ============================================
	// Output Length Distribution
	// ============================================
	console.log(chalk.cyan('\n📏 Output Length Distribution:\n'));

	const outputLengths = examples.map((ex) => ex.output.length);
	outputLengths.sort((a, b) => a - b);

	const percentiles = {
		p25: outputLengths[Math.floor(outputLengths.length * 0.25)],
		p50: outputLengths[Math.floor(outputLengths.length * 0.5)],
		p75: outputLengths[Math.floor(outputLengths.length * 0.75)],
		p90: outputLengths[Math.floor(outputLengths.length * 0.9)],
		max: Math.max(...outputLengths)
	};

	console.log(chalk.white('   Percentiles (characters):'));
	console.log(chalk.gray(`      25th: ${percentiles.p25}`));
	console.log(chalk.gray(`      50th (median): ${percentiles.p50}`));
	console.log(chalk.gray(`      75th: ${percentiles.p75}`));
	console.log(chalk.gray(`      90th: ${percentiles.p90}`));
	console.log(chalk.gray(`      Max: ${percentiles.max}\n`));

	// ============================================
	// Instruction Diversity
	// ============================================
	console.log(chalk.cyan('🎯 Instruction Diversity:\n'));

	const instructionPrefixes = {};
	for (const ex of examples) {
		const prefix = ex.instruction.split(' ').slice(0, 3).join(' ');
		instructionPrefixes[prefix] = (instructionPrefixes[prefix] || 0) + 1;
	}

	const uniquePrefixes = Object.keys(instructionPrefixes).length;
	const avgRepetition = examples.length / uniquePrefixes;

	console.log(chalk.white(`   Unique instruction prefixes: ${uniquePrefixes}`));
	console.log(chalk.white(`   Average repetition: ${avgRepetition.toFixed(2)}x`));
	console.log(chalk.gray(`   (Lower is more diverse)\n`));

	// Top 5 most common prefixes
	const topPrefixes = Object.entries(instructionPrefixes)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5);

	console.log(chalk.white('   Most common instruction prefixes:'));
	for (const [prefix, count] of topPrefixes) {
		console.log(chalk.gray(`      "${prefix}..." (${count}x)`));
	}

	// ============================================
	// Quality Checks
	// ============================================
	console.log(chalk.cyan('\n✅ Quality Checks:\n'));

	const emptyInputs = examples.filter((ex) => ex.input === '').length;
	const shortOutputs = examples.filter((ex) => ex.output.length < 50).length;
	const longOutputs = examples.filter((ex) => ex.output.length > 1000).length;

	console.log(chalk.white(`   Empty inputs: ${emptyInputs} (${((emptyInputs / examples.length) * 100).toFixed(1)}%)`));
	console.log(chalk.white(`   Short outputs (<50 chars): ${shortOutputs}`));
	console.log(chalk.white(`   Long outputs (>1000 chars): ${longOutputs}`));

	// ============================================
	// Training Recommendations
	// ============================================
	console.log(chalk.cyan('\n🚀 Training Recommendations:\n'));

	const totalTokensBudget = avgTokens.total * examples.length;
	const estimatedSteps = Math.ceil((examples.length / 2) * 3); // batch_size=2, 3 epochs

	console.log(chalk.white(`   Recommended max_steps: ${estimatedSteps}`));
	console.log(chalk.white(`   Estimated total tokens: ${totalTokensBudget.toLocaleString()}`));
	console.log(chalk.white(`   Context window needed: ${maxTokens.total} (using 4096 is safe)`));

	if (avgRepetition > 2) {
		console.log(chalk.yellow('\n   ⚠️  High instruction repetition detected'));
		console.log(chalk.gray('      Consider adding more diverse examples'));
	}

	if (shortOutputs > examples.length * 0.2) {
		console.log(chalk.yellow('\n   ⚠️  Many short outputs detected'));
		console.log(chalk.gray('      Ensure outputs provide sufficient detail'));
	}

	console.log(chalk.green('\n✅ Dataset analysis complete!\n'));
}

main().catch((error) => {
	console.error(chalk.red('Fatal error:'), error);
	process.exit(1);
});
