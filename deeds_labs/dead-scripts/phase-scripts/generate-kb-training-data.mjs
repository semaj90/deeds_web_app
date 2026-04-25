#!/usr/bin/env node
/**
 * 🎓 Phase 77: Knowledge Base to Training Data Adapter
 *
 * Converts Phase 76 knowledge base (Qdrant vectors) into instruction-tuning
 * dataset for Gemma 3 fine-tuning. Generates diverse examples from:
 * - Svelte 5 migration patterns
 * - TypeScript error fixes
 * - SvelteKit routing/loading
 * - Drizzle ORM schemas
 * - UnoCSS/Bits UI patterns
 *
 * Output: kb_training_data.jsonl (Alpaca format)
 *
 * Usage:
 *   node scripts/generate-kb-training-data.mjs
 *   node scripts/generate-kb-training-data.mjs --limit 100 --output kb_training_data.jsonl
 */

import chalk from 'chalk';
import fs from 'fs/promises';

const CONFIG = {
	qdrant: {
		url: process.env.QDRANT_URL || 'http://localhost:6333',
		collection: 'phase76_knowledge_base',
		errorCollection: 'phase72_error_patterns'
	},
	ollama: {
		url: process.env.OLLAMA_URL || 'http://localhost:11434',
		embeddingModel: 'embeddinggemma:latest'
	},
	output: {
		file: process.argv.includes('--output')
			? process.argv[process.argv.indexOf('--output') + 1]
			: 'kb_training_data.jsonl',
		limit: process.argv.includes('--limit')
			? parseInt(process.argv[process.argv.indexOf('--limit') + 1])
			: 50
	}
};

// 🎯 Instruction Templates
const INSTRUCTION_TEMPLATES = {
	svelte5_migration: [
		'Convert this Svelte 4 component to Svelte 5 with Runes.',
		'Migrate "{topic}" from Svelte 4 to Svelte 5 syntax.',
		'Fix: Convert reactive statement to $derived for "{topic}".',
		'Refactor: Change on:{event} to onclick for "{topic}".',
		'Update props to $props() syntax for "{topic}".'
	],
	typescript_error: [
		'Fix this TypeScript error: "{topic}". Provide the correct type annotation.',
		'How do I properly type "{topic}" in TypeScript 5.6+?',
		'Resolve TypeScript compilation error in "{topic}".',
		'What\'s the correct type definition for "{topic}"?'
	],
	sveltekit_routing: [
		'Explain "{topic}" in SvelteKit. Use modern Runes syntax.',
		'How do I implement "{topic}" in SvelteKit with Svelte 5?',
		'Create a SvelteKit route for "{topic}" with proper typing.',
		'What are best practices for "{topic}" in SvelteKit?'
	],
	drizzle_orm: [
		'Define a database schema for "{topic}" using Drizzle ORM 0.44.',
		'How do I create relations for "{topic}" in Drizzle ORM?',
		'Fix this Drizzle ORM error related to "{topic}".',
		'Write a Drizzle query for "{topic}" with proper types.'
	],
	unocss_bits: [
		'Apply UnoCSS utility classes for "{topic}" in a SvelteKit component.',
		'Style the Bits UI "{topic}" component with UnoCSS utilities.',
		'How do I add animations to Bits UI "{topic}" with Svelte 5 transitions?',
		'Configure UnoCSS shortcuts for "{topic}" patterns.'
	],
	general_code: [
		'Explain "{topic}" in Svelte 5. Use modern Runes syntax, not stores.',
		'What\'s new in "{topic}" regarding modern TypeScript?',
		'How do I implement "{topic}" with type safety?',
		'Best practices for "{topic}" in a production SvelteKit app.'
	]
};

/**
 * Generate embedding for query
 */
async function generateEmbedding(text) {
	try {
		const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: CONFIG.ollama.embeddingModel,
				prompt: text
			})
		});

		if (!response.ok) throw new Error('Embedding generation failed');
		const data = await response.json();
		return data.embedding;
	} catch (err) {
		console.error(chalk.red(`❌ Embedding error: ${err.message}`));
		return null;
	}
}

/**
 * Query Qdrant knowledge base
 */
async function queryKnowledgeBase(query, limit = 5) {
	try {
		const embedding = await generateEmbedding(query);
		if (!embedding) return [];

		const response = await fetch(
			`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}/points/search`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vector: embedding,
					limit,
					score_threshold: 0.7,
					with_payload: true
				})
			}
		);

		if (!response.ok) return [];
		const data = await response.json();
		return data.result || [];
	} catch (err) {
		console.error(chalk.red(`❌ Query error: ${err.message}`));
		return [];
	}
}

/**
 * Determine category from payload
 */
function categorizePayload(payload) {
	const title = (payload.title || '').toLowerCase();
	const url = (payload.url || '').toLowerCase();
	const content = (payload.content || payload.summary || '').toLowerCase();

	if (content.includes('$state') || content.includes('$props') || content.includes('rune')) {
		return 'svelte5_migration';
	}
	if (title.includes('typescript') || url.includes('typescript')) {
		return 'typescript_error';
	}
	if (title.includes('sveltekit') || url.includes('kit.svelte')) {
		return 'sveltekit_routing';
	}
	if (title.includes('drizzle') || content.includes('pgTable')) {
		return 'drizzle_orm';
	}
	if (title.includes('unocss') || title.includes('bits ui')) {
		return 'unocss_bits';
	}
	return 'general_code';
}

/**
 * Generate instruction from template
 */
function generateInstruction(category, topic) {
	const templates = INSTRUCTION_TEMPLATES[category] || INSTRUCTION_TEMPLATES.general_code;
	const template = templates[Math.floor(Math.random() * templates.length)];
	return template.replace('{topic}', topic);
}

/**
 * Extract topic from payload
 */
function extractTopic(payload) {
	return payload.title || payload.file || 'code migration';
}

/**
 * Clean and truncate output
 */
function cleanOutput(text, maxLength = 500) {
	let cleaned = text
		.replace(/\n{3,}/g, '\n\n')
		.replace(/\s+/g, ' ')
		.trim();

	if (cleaned.length > maxLength) {
		cleaned = cleaned.substring(0, maxLength) + '...';
	}

	return cleaned;
}

/**
 * Convert knowledge base result to training example
 */
function convertToTrainingExample(result) {
	const { payload, score } = result;
	const category = categorizePayload(payload);
	const topic = extractTopic(payload);
	const instruction = generateInstruction(category, topic);

	// Use content or summary as output
	const output = cleanOutput(
		payload.content || payload.summary || payload.message || 'No content available',
		600
	);

	return {
		instruction,
		input: '', // Alpaca format (empty input for generation tasks)
		output
	};
}

/**
 * Generate diverse search queries
 */
function generateSearchQueries() {
	return [
		// Svelte 5
		'Svelte 5 runes migration',
		'$state reactive variables',
		'$props component props',
		'$derived computed values',
		'$effect side effects',
		'Svelte 5 event handlers',
		'createEventDispatcher callback props',

		// TypeScript
		'TypeScript 5.6 features',
		'TypeScript type annotations',
		'TypeScript narrowing',
		'TypeScript generics',
		'TypeScript utility types',

		// SvelteKit
		'SvelteKit routing',
		'SvelteKit load functions',
		'SvelteKit form actions',
		'SvelteKit error handling',
		'SvelteKit state management',

		// Drizzle ORM
		'Drizzle ORM schema',
		'Drizzle relations',
		'Drizzle PostgreSQL',
		'Drizzle migrations',

		// UnoCSS / Bits UI
		'UnoCSS utilities',
		'Bits UI components',
		'UnoCSS Svelte Scoped',
		'Tailwind CSS migration',

		// General
		'React to Svelte migration',
		'Vue to Svelte migration',
		'Modern JavaScript patterns',
		'Web component best practices'
	];
}

/**
 * Main: Generate training data from knowledge base
 */
async function main() {
	console.log(chalk.cyan.bold('\n🎓 Phase 77: Knowledge Base to Training Data\n'));

	const queries = generateSearchQueries();
	const allExamples = [];
	const seenOutputs = new Set(); // Deduplicate

	console.log(chalk.gray(`   Searching ${queries.length} topics...\n`));

	for (const query of queries) {
		console.log(chalk.gray(`   🔍 "${query}"`));

		const results = await queryKnowledgeBase(query, 3);

		for (const result of results) {
			const example = convertToTrainingExample(result);

			// Deduplicate by output
			if (!seenOutputs.has(example.output)) {
				allExamples.push(example);
				seenOutputs.add(example.output);
			}

			// Stop if we hit the limit
			if (allExamples.length >= CONFIG.output.limit) {
				break;
			}
		}

		if (allExamples.length >= CONFIG.output.limit) {
			break;
		}

		// Rate limiting
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	console.log(chalk.green(`\n✅ Generated ${allExamples.length} training examples\n`));

	// Write JSONL
	const jsonlContent = allExamples.map((ex) => JSON.stringify(ex)).join('\n');
	await fs.writeFile(CONFIG.output.file, jsonlContent, 'utf-8');

	const fileSizeKB = (Buffer.byteLength(jsonlContent, 'utf-8') / 1024).toFixed(1);

	console.log(chalk.cyan('📊 Summary:\n'));
	console.log(chalk.white(`   Total examples: ${allExamples.length}`));
	console.log(chalk.white(`   Output file: ${CONFIG.output.file}`));
	console.log(chalk.white(`   Size: ${fileSizeKB} KB`));

	// Category breakdown
	const categories = {};
	for (const ex of allExamples) {
		const payload = { title: ex.instruction };
		const cat = categorizePayload(payload);
		categories[cat] = (categories[cat] || 0) + 1;
	}

	console.log(chalk.cyan('\n📈 Category Breakdown:\n'));
	for (const [cat, count] of Object.entries(categories)) {
		const percentage = ((count / allExamples.length) * 100).toFixed(1);
		console.log(chalk.white(`   ${cat.padEnd(20)} ${count} (${percentage}%)`));
	}

	console.log(chalk.green('\n✅ Ready for fine-tuning!\n'));
}

main().catch((error) => {
	console.error(chalk.red('Fatal error:'), error);
	process.exit(1);
});
