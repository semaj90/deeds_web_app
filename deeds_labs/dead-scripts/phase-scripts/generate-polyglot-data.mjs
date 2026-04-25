/**
 * 🌍 Phase 76: Polyglot Training Data Generator
 *
 * Creates a comprehensive training dataset for multiple technologies:
 * - Svelte 5 (Runes)
 * - SvelteKit 2.0
 * - Drizzle ORM 0.44
 * - UnoCSS
 * - Bits UI
 * - TypeScript 5.x
 * - C++, Python, Go (basics)
 *
 * Usage:
 *   node scripts/generate-polyglot-data.mjs
 *   node scripts/generate-polyglot-data.mjs --output custom.jsonl
 */

import fs from 'fs';
import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const OUTPUT_FILE = process.argv.includes('--output')
	? process.argv[process.argv.indexOf('--output') + 1]
	: 'polyglot_training_data.jsonl';

// 🎯 Technology-specific instruction templates
const TECH_PROMPTS = {
	'svelte.dev': {
		lang: 'Svelte 5',
		color: chalk.hex('#FF3E00'),
		instructions: [
			(title) => `Convert this Svelte 4 component "${title}" to use Svelte 5 Runes ($state, $props, $derived, $effect).`,
			(title) => `Explain "${title}" in Svelte 5. Use modern Runes syntax, not stores.`,
			(title) => `Refactor: Change on:click to onclick for "${title}" following Svelte 5 event handling.`,
			(title) => `What is the Svelte 5 equivalent of createEventDispatcher for "${title}"? Use callback props.`,
			(title) => `Fix: Convert "let x = 0" to "let x = $state(0)" for reactive "${title}" component.`
		]
	},
	'kit.svelte.dev': {
		lang: 'SvelteKit 2.0',
		color: chalk.hex('#FF3E00'),
		instructions: [
			(title) => `Implement "${title}" in SvelteKit 2.0 with proper +page.server.ts load function.`,
			(title) => `How do I handle "${title}" in SvelteKit using form actions with progressive enhancement?`,
			(title) => `Convert this SvelteKit 1.x "${title}" pattern to SvelteKit 2.0 with Svelte 5.`
		]
	},
	'orm.drizzle.team': {
		lang: 'Drizzle ORM 0.44',
		color: chalk.hex('#C5F74F'),
		instructions: [
			(title) => `Fix this Drizzle ORM error related to "${title}" using Relations API v2.`,
			(title) => `Define a database schema for "${title}" using Drizzle ORM 0.44 with pgTable.`,
			(title) => `How do I create a many-to-many relation for "${title}" in Drizzle 0.44?`,
			(title) => `Migrate from Prisma to Drizzle ORM for "${title}" functionality.`
		]
	},
	'unocss.dev': {
		lang: 'UnoCSS',
		color: chalk.hex('#333333'),
		instructions: [
			(title) => `Apply UnoCSS utility classes for "${title}" in a SvelteKit component (Scoped Mode).`,
			(title) => `Convert this Tailwind CSS "${title}" component to use UnoCSS attributify mode.`,
			(title) => `Configure UnoCSS shortcuts for "${title}" patterns in svelte.config.js.`
		]
	},
	'bits-ui.com': {
		lang: 'Bits UI (Svelte 5)',
		color: chalk.hex('#7C3AED'),
		instructions: [
			(title) => `Implement the "${title}" component using Bits UI for Svelte 5 (use Snippets, not asChild).`,
			(title) => `Style the Bits UI "${title}" component with UnoCSS utilities.`,
			(title) => `How do I add animations to Bits UI "${title}" with Svelte 5 transitions?`
		]
	},
	'typescriptlang.org': {
		lang: 'TypeScript 5.x',
		color: chalk.hex('#3178C6'),
		instructions: [
			(title) => `Fix this TypeScript error: "${title}". Provide the correct type annotation.`,
			(title) => `What's new in TypeScript 5.7 regarding "${title}"?`,
			(title) => `How do I properly type "${title}" in a Svelte 5 component with $props()?`
		]
	}
};

// Manual examples for languages not in Qdrant
const MANUAL_EXAMPLES = [
	// Svelte 5 Runes - Core conversions
	{
		instruction: 'Convert "let count = 0" to Svelte 5 reactive state.',
		input: 'let count = 0;',
		output: 'let count = $state(0);'
	},
	{
		instruction: 'Convert Svelte 4 props to Svelte 5 $props() syntax.',
		input: 'export let name: string;\nexport let age: number;',
		output: 'let { name, age }: { name: string; age: number } = $props();'
	},
	{
		instruction: 'Convert on:click to Svelte 5 onclick handler.',
		input: '<button on:click={handleClick}>Click</button>',
		output: '<button onclick={handleClick}>Click</button>'
	},
	{
		instruction: 'Convert on:input to Svelte 5 oninput handler.',
		input: '<input on:input={handleInput} />',
		output: '<input oninput={handleInput} />'
	},
	{
		instruction: 'Convert createEventDispatcher to Svelte 5 callback props.',
		input: `import { createEventDispatcher } from 'svelte';\nconst dispatch = createEventDispatcher();\ndispatch('submit', data);`,
		output: `let { onSubmit }: { onSubmit: (data: any) => void } = $props();\nonSubmit(data);`
	},
	{
		instruction: 'Convert $: reactive statement to Svelte 5 $derived.',
		input: '$: doubled = count * 2;',
		output: 'let doubled = $derived(count * 2);'
	},
	{
		instruction: 'Convert $: reactive block to Svelte 5 $effect.',
		input: '$: {\n  console.log(count);\n  fetch(`/api/${count}`);\n}',
		output: '$effect(() => {\n  console.log(count);\n  fetch(`/api/${count}`);\n});'
	},
	{
		instruction: 'Convert Svelte store to Svelte 5 $state.',
		input: `import { writable } from 'svelte/store';\nconst count = writable(0);`,
		output: 'let count = $state(0);'
	},
	// Drizzle ORM
	{
		instruction: 'Define a users table with Drizzle ORM 0.44 and pgTable.',
		input: '',
		output: `import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';\n\nexport const users = pgTable('users', {\n  id: serial('id').primaryKey(),\n  name: text('name').notNull(),\n  email: text('email').unique().notNull(),\n  createdAt: timestamp('created_at').defaultNow()\n});`
	},
	{
		instruction: 'Create a one-to-many relation in Drizzle ORM 0.44.',
		input: '',
		output: `import { relations } from 'drizzle-orm';\n\nexport const usersRelations = relations(users, ({ many }) => ({\n  posts: many(posts)\n}));\n\nexport const postsRelations = relations(posts, ({ one }) => ({\n  author: one(users, {\n    fields: [posts.authorId],\n    references: [users.id]\n  })\n}));`
	},
	// TypeScript
	{
		instruction: 'Fix TypeScript error: Property does not exist on type.',
		input: `const user = { name: 'John' };\nconsole.log(user.age); // Error: Property 'age' does not exist`,
		output: `interface User {\n  name: string;\n  age?: number;\n}\nconst user: User = { name: 'John' };\nconsole.log(user.age); // OK, age is optional`
	},
	// C++ (Basic)
	{
		instruction: 'Write a C++ class for a simple vector math library.',
		input: '',
		output: `class Vec3 {\npublic:\n  float x, y, z;\n  Vec3(float x = 0, float y = 0, float z = 0) : x(x), y(y), z(z) {}\n  Vec3 operator+(const Vec3& v) const { return Vec3(x + v.x, y + v.y, z + v.z); }\n  float dot(const Vec3& v) const { return x * v.x + y * v.y + z * v.z; }\n};`
	},
	// Python (Basic)
	{
		instruction: 'Create a Python FastAPI health check endpoint.',
		input: '',
		output: `from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/health")\nasync def health_check():\n    return {"status": "ok", "service": "legal-ai"}`
	},
	// Go (Basic)
	{
		instruction: 'Implement a Go HTTP handler for a microservice.',
		input: '',
		output: `package main\n\nimport (\n    "encoding/json"\n    "net/http"\n)\n\nfunc healthHandler(w http.ResponseWriter, r *http.Request) {\n    w.Header().Set("Content-Type", "application/json")\n    json.NewEncoder(w).Encode(map[string]string{"status": "ok"})\n}`
	}
];

async function generatePolyglotDataset() {
	console.log(chalk.cyan.bold('\n🌍 Phase 76: Polyglot Training Data Generator\n'));

	const dataset = [];
	const stats = {};

	try {
		// 1. Fetch from Qdrant
		console.log(chalk.blue('🔍 Scanning Knowledge Base for Polyglot DNA...\n'));

		const collections = await qdrant.getCollections();
		const hasCollection = collections.collections.some(c => c.name === 'phase76_knowledge_base');

		if (hasCollection) {
			const result = await qdrant.scroll('phase76_knowledge_base', {
				limit: 2000,
				with_payload: true,
				with_vector: false
			});

			const points = result.points || [];
			console.log(chalk.gray(`   Found ${points.length} knowledge points in Qdrant\n`));

			for (const point of points) {
				const p = point.payload;
				if (!p.url) continue;

				// Match URL to technology
				for (const [urlPattern, config] of Object.entries(TECH_PROMPTS)) {
					if (p.url.includes(urlPattern)) {
						const instruction = config.instructions[
							Math.floor(Math.random() * config.instructions.length)
						](p.title || 'this concept');

						dataset.push(JSON.stringify({
							instruction,
							input: '',
							output: (p.summary || p.content || '').substring(0, 3000)
						}));

						stats[config.lang] = (stats[config.lang] || 0) + 1;
						break;
					}
				}
			}
		} else {
			console.log(chalk.yellow('   ⚠️ Knowledge base not found, using manual examples only'));
		}

		// 2. Add manual examples (high-quality curated data)
		console.log(chalk.blue('📝 Adding curated manual examples...\n'));

		for (const example of MANUAL_EXAMPLES) {
			dataset.push(JSON.stringify(example));
		}
		stats['Manual (Curated)'] = MANUAL_EXAMPLES.length;

		// 3. Write output
		if (dataset.length > 0) {
			fs.writeFileSync(OUTPUT_FILE, dataset.join('\n'));

			console.log(chalk.green(`✅ Generated ${dataset.length} Polyglot Training Examples\n`));
			console.log(chalk.gray('📊 Breakdown by Technology:\n'));

			for (const [tech, count] of Object.entries(stats)) {
				const config = Object.values(TECH_PROMPTS).find(t => t.lang === tech);
				const color = config?.color || chalk.white;
				console.log(`   ${color('●')} ${tech}: ${count} examples`);
			}

			console.log(chalk.cyan(`\n📂 Saved to: ${OUTPUT_FILE}`));
			console.log(chalk.gray(`   File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB\n`));

			console.log(chalk.yellow('🚀 Next Steps:'));
			console.log(chalk.gray('   1. Upload to Google Colab'));
			console.log(chalk.gray('   2. Run Unsloth fine-tuning notebook'));
			console.log(chalk.gray('   3. Export GGUF and load into Ollama\n'));
		}

	} catch (error) {
		console.error(chalk.red('❌ Error:'), error.message);
	}
}

generatePolyglotDataset().catch(console.error);
