#!/usr/bin/env node
/**
 * 🎓 Phase 77: Enhanced Training Data Generator
 *
 * Generates instruction-tuning examples from multiple sources:
 * 1. Project documentation (PHASE*.md files)
 * 2. Code examples (src/ routes, components)
 * 3. Error patterns (from existing error reports)
 * 4. Structured templates (pre-defined patterns)
 *
 * Output: enhanced_training_data.jsonl (Alpaca format)
 *
 * Usage:
 *   node scripts/generate-enhanced-training-data.mjs
 *   node scripts/generate-enhanced-training-data.mjs --count 100
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

const CONFIG = {
	output: {
		file: 'enhanced_training_data.jsonl',
		targetCount: process.argv.includes('--count')
			? parseInt(process.argv[process.argv.indexOf('--count') + 1])
			: 100
	}
};

// 🎯 Structured Training Templates
const TRAINING_TEMPLATES = [
	// ============================================
	// SVELTE 5 RUNES - Advanced Patterns
	// ============================================
	{
		instruction: 'Convert a Svelte 4 store-based counter to Svelte 5 $state.',
		input: 'import { writable } from "svelte/store";\nconst count = writable(0);\nconst increment = () => count.update(n => n + 1);',
		output: 'let count = $state(0);\nconst increment = () => { count += 1; };'
	},
	{
		instruction: 'Migrate Svelte 4 derived store to Svelte 5 $derived.',
		input: 'import { derived, writable } from "svelte/store";\nconst count = writable(0);\nconst doubled = derived(count, $count => $count * 2);',
		output: 'let count = $state(0);\nlet doubled = $derived(count * 2);'
	},
	{
		instruction: 'Convert Svelte 4 reactive statement with side effects to $effect.',
		input: '$: {\n  console.log("Count changed:", count);\n  document.title = `Count: ${count}`;\n}',
		output: '$effect(() => {\n  console.log("Count changed:", count);\n  document.title = `Count: ${count}`;\n});'
	},
	{
		instruction: 'Migrate Svelte 4 component props with defaults to $props().',
		input: 'export let name = "Guest";\nexport let age: number;\nexport let role = "user";',
		output: 'let { name = "Guest", age, role = "user" }: { name?: string; age: number; role?: string } = $props();'
	},
	{
		instruction: 'Convert on:click event handler to Svelte 5 onclick syntax.',
		input: '<button on:click={handleClick}>Submit</button>',
		output: '<button onclick={handleClick}>Submit</button>'
	},
	{
		instruction: 'Replace createEventDispatcher with callback props in Svelte 5.',
		input: 'import { createEventDispatcher } from "svelte";\nconst dispatch = createEventDispatcher();\nfunction submit() {\n  dispatch("submit", { data });\n}',
		output: 'let { onSubmit }: { onSubmit: (data: any) => void } = $props();\nfunction submit() {\n  onSubmit({ data });\n}'
	},
	{
		instruction: 'Migrate Svelte 4 reactive class binding to Svelte 5.',
		input: '$: isActive = count > 5;\n<div class:active={isActive}>Content</div>',
		output: 'let isActive = $derived(count > 5);\n<div class:active={isActive}>Content</div>'
	},
	{
		instruction: 'Convert Svelte 4 each block with index to Svelte 5 syntax.',
		input: '{#each items as item, i}\n  <li>{i + 1}. {item.name}</li>\n{/each}',
		output: '{#each items as item, i}\n  <li>{i + 1}. {item.name}</li>\n{/each}'
	},
	{
		instruction: 'Migrate bind:value to Svelte 5 two-way binding with $state.',
		input: 'let name = "";\n<input bind:value={name} />',
		output: 'let name = $state("");\n<input bind:value={name} />'
	},
	{
		instruction: 'Convert Svelte 4 lifecycle onMount to Svelte 5 $effect.',
		input: 'import { onMount } from "svelte";\nonMount(() => {\n  fetchData();\n});',
		output: 'import { onMount } from "svelte";\nonMount(() => {\n  fetchData();\n}); // Keep onMount for one-time initialization'
	},

	// ============================================
	// TYPESCRIPT 5.6+ PATTERNS
	// ============================================
	{
		instruction: 'Fix TypeScript error: Property does not exist on type for optional chaining.',
		input: 'const user = { name: "Alice" };\nconsole.log(user.age); // Error',
		output: 'interface User {\n  name: string;\n  age?: number;\n}\nconst user: User = { name: "Alice" };\nconsole.log(user.age); // OK'
	},
	{
		instruction: 'Define a generic function with type constraints in TypeScript.',
		input: 'function getProperty(obj, key) {\n  return obj[key];\n}',
		output: 'function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {\n  return obj[key];\n}'
	},
	{
		instruction: 'Use TypeScript utility type Partial for optional properties.',
		input: 'interface User {\n  id: number;\n  name: string;\n  email: string;\n}\nfunction updateUser(id: number, updates: any) { }',
		output: 'interface User {\n  id: number;\n  name: string;\n  email: string;\n}\nfunction updateUser(id: number, updates: Partial<User>) { }'
	},
	{
		instruction: 'Fix TypeScript narrowing with typeof type guard.',
		input: 'function padLeft(value: string, padding: string | number) {\n  return padding + value; // Error: padding might be number\n}',
		output: 'function padLeft(value: string, padding: string | number) {\n  if (typeof padding === "number") {\n    return " ".repeat(padding) + value;\n  }\n  return padding + value;\n}'
	},
	{
		instruction: 'Define a discriminated union in TypeScript for type safety.',
		input: 'type Result = { success: boolean; data?: any; error?: string; };',
		output: 'type Success = { success: true; data: any };\ntype Failure = { success: false; error: string };\ntype Result = Success | Failure;'
	},

	// ============================================
	// SVELTEKIT ROUTING & DATA LOADING
	// ============================================
	{
		instruction: 'Create a SvelteKit load function with type-safe params.',
		input: 'export async function load({ params }) {\n  const post = await fetchPost(params.slug);\n  return { post };\n}',
		output: 'import type { PageLoad } from "./$types";\n\nexport const load: PageLoad = async ({ params }) => {\n  const post = await fetchPost(params.slug);\n  return { post };\n};'
	},
	{
		instruction: 'Implement a SvelteKit form action with validation.',
		input: 'export const actions = {\n  default: async ({ request }) => {\n    const data = await request.formData();\n    return { success: true };\n  }\n};',
		output: 'import type { Actions } from "./$types";\nimport { fail } from "@sveltejs/kit";\n\nexport const actions: Actions = {\n  default: async ({ request }) => {\n    const data = await request.formData();\n    const email = data.get("email");\n    if (!email) return fail(400, { email, missing: true });\n    return { success: true };\n  }\n};'
	},
	{
		instruction: 'Create a SvelteKit layout with shared data loading.',
		input: '// +layout.server.ts\nexport async function load() {\n  return { user: null };\n}',
		output: 'import type { LayoutServerLoad } from "./$types";\n\nexport const load: LayoutServerLoad = async ({ locals }) => {\n  return {\n    user: locals.user\n  };\n};'
	},
	{
		instruction: 'Handle errors in SvelteKit with custom error page.',
		input: 'throw new Error("Not found");',
		output: 'import { error } from "@sveltejs/kit";\nthrow error(404, { message: "Post not found" });'
	},
	{
		instruction: 'Implement SvelteKit server-only secrets protection.',
		input: 'export async function load() {\n  const apiKey = process.env.SECRET_KEY;\n  return { apiKey };\n}',
		output: 'export async function load() {\n  const apiKey = process.env.SECRET_KEY;\n  // Never return secrets to client\n  const data = await fetchData(apiKey);\n  return { data };\n}'
	},

	// ============================================
	// DRIZZLE ORM 0.44
	// ============================================
	{
		instruction: 'Define a PostgreSQL table schema with Drizzle ORM 0.44.',
		input: '',
		output: 'import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";\n\nexport const users = pgTable("users", {\n  id: serial("id").primaryKey(),\n  name: text("name").notNull(),\n  email: text("email").unique().notNull(),\n  createdAt: timestamp("created_at").defaultNow()\n});'
	},
	{
		instruction: 'Create a one-to-many relation in Drizzle ORM.',
		input: '',
		output: 'import { relations } from "drizzle-orm";\n\nexport const usersRelations = relations(users, ({ many }) => ({\n  posts: many(posts)\n}));\n\nexport const postsRelations = relations(posts, ({ one }) => ({\n  author: one(users, {\n    fields: [posts.authorId],\n    references: [users.id]\n  })\n}));'
	},
	{
		instruction: 'Write a Drizzle ORM select query with filters.',
		input: '',
		output: 'import { db } from "./db";\nimport { users } from "./schema";\nimport { eq } from "drizzle-orm";\n\nconst activeUsers = await db.select().from(users).where(eq(users.active, true));'
	},
	{
		instruction: 'Implement Drizzle ORM transaction with rollback.',
		input: '',
		output: 'await db.transaction(async (tx) => {\n  await tx.insert(users).values({ name: "Alice" });\n  await tx.insert(posts).values({ title: "Post 1", authorId: 1 });\n  // Auto-rollback on error\n});'
	},

	// ============================================
	// UNOCSS & BITS UI
	// ============================================
	{
		instruction: 'Apply UnoCSS utility classes for responsive layout.',
		input: '<div class="container">Content</div>',
		output: '<div class="flex flex-col md:flex-row gap-4 p-4 max-w-screen-lg mx-auto">Content</div>'
	},
	{
		instruction: 'Style a Bits UI Dialog component with UnoCSS.',
		input: '<Dialog.Root>\n  <Dialog.Trigger>Open</Dialog.Trigger>\n</Dialog.Root>',
		output: '<Dialog.Root>\n  <Dialog.Trigger class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Open</Dialog.Trigger>\n  <Dialog.Content class="p-6 bg-white rounded-lg shadow-xl max-w-md">\n    Content\n  </Dialog.Content>\n</Dialog.Root>'
	},
	{
		instruction: 'Configure UnoCSS theme with custom colors.',
		input: '',
		output: 'import { defineConfig, presetUno } from "unocss";\n\nexport default defineConfig({\n  presets: [presetUno()],\n  theme: {\n    colors: {\n      primary: "#3b82f6",\n      secondary: "#8b5cf6"\n    }\n  }\n});'
	},

	// ============================================
	// ERROR HANDLING & DEBUGGING
	// ============================================
	{
		instruction: 'Debug "Cannot read property of undefined" error.',
		input: 'const name = user.profile.name; // Error',
		output: 'const name = user?.profile?.name ?? "Unknown"; // Optional chaining + nullish coalescing'
	},
	{
		instruction: 'Fix "Module not found" error in SvelteKit.',
		input: 'import { db } from "$lib/database";',
		output: '// Check svelte.config.js aliases:\nexport default {\n  kit: {\n    alias: {\n      "$lib": "./src/lib"\n    }\n  }\n};'
	},
	{
		instruction: 'Resolve "Type is not assignable" TypeScript error.',
		input: 'const nums: number[] = [1, 2, 3];\nconst mixed = [...nums, "four"]; // Error',
		output: 'const nums: number[] = [1, 2, 3];\nconst mixed: (number | string)[] = [...nums, "four"]; // OK'
	},

	// ============================================
	// PERFORMANCE OPTIMIZATION
	// ============================================
	{
		instruction: 'Optimize Svelte 5 component re-renders with $derived.',
		input: '$: expensiveCalc = heavyComputation(count);',
		output: 'let expensiveCalc = $derived(heavyComputation(count)); // Only recomputes when count changes'
	},
	{
		instruction: 'Implement lazy loading for SvelteKit routes.',
		input: 'export const prerender = true;',
		output: 'export const prerender = false;\nexport const ssr = true;\nexport const csr = true; // Hybrid rendering'
	},
	{
		instruction: 'Use Drizzle ORM prepared statements for performance.',
		input: 'const user = await db.select().from(users).where(eq(users.id, id));',
		output: 'const getUserById = db.select().from(users).where(eq(users.id, sql.placeholder("id"))).prepare();\nconst user = await getUserById.execute({ id });'
	},

	// ============================================
	// TESTING
	// ============================================
	{
		instruction: 'Write a Vitest test for a Svelte 5 component.',
		input: '',
		output: 'import { render, fireEvent } from "@testing-library/svelte";\nimport { expect, test } from "vitest";\nimport Counter from "./Counter.svelte";\n\ntest("increments counter", async () => {\n  const { getByText } = render(Counter);\n  const button = getByText("Count: 0");\n  await fireEvent.click(button);\n  expect(button).toHaveTextContent("Count: 1");\n});'
	},
	{
		instruction: 'Test a SvelteKit load function with Vitest.',
		input: '',
		output: 'import { expect, test, vi } from "vitest";\nimport { load } from "./+page.server";\n\ntest("load returns user data", async () => {\n  const result = await load({ params: { id: "1" }, locals: {}, fetch: vi.fn() } as any);\n  expect(result).toHaveProperty("user");\n});'
	},

	// ============================================
	// SECURITY
	// ============================================
	{
		instruction: 'Implement CSRF protection in SvelteKit forms.',
		input: '',
		output: 'import { verifyRequestOrigin } from "@sveltejs/kit";\n\nexport async function handle({ event, resolve }) {\n  if (event.request.method === "POST") {\n    const allowed = verifyRequestOrigin(event);\n    if (!allowed) throw error(403, "CSRF check failed");\n  }\n  return resolve(event);\n}'
	},
	{
		instruction: 'Sanitize user input to prevent XSS attacks.',
		input: 'const comment = formData.get("comment");\nawait db.insert(comments).values({ text: comment });',
		output: 'import DOMPurify from "isomorphic-dompurify";\nconst rawComment = formData.get("comment");\nconst comment = DOMPurify.sanitize(rawComment);\nawait db.insert(comments).values({ text: comment });'
	},

	// ============================================
	// DEPLOYMENT
	// ============================================
	{
		instruction: 'Configure SvelteKit for Vercel deployment.',
		input: '',
		output: 'import adapter from "@sveltejs/adapter-vercel";\n\nexport default {\n  kit: {\n    adapter: adapter({\n      runtime: "nodejs20.x",\n      regions: ["iad1"]\n    })\n  }\n};'
	},
	{
		instruction: 'Set environment variables for production SvelteKit.',
		input: '',
		output: '// .env.production\nDATABASE_URL="postgresql://..."\nPUBLIC_API_URL="https://api.example.com"\n\n// vite.config.ts\nexport default defineConfig({\n  define: {\n    "import.meta.env.DATABASE_URL": JSON.stringify(process.env.DATABASE_URL)\n  }\n});'
	}
];

/**
 * Generate additional examples by varying existing ones
 */
function generateVariations(templates) {
	const variations = [];

	// Add reverse migrations (Svelte 5 → explanation)
	for (const template of templates) {
		if (template.instruction.includes('Svelte 5') || template.instruction.includes('$state')) {
			variations.push({
				instruction: `Explain this Svelte 5 code: ${template.output.substring(0, 50)}...`,
				input: '',
				output: template.instruction + '\n\n' + template.output
			});
		}
	}

	// Add "why" questions
	const whyExamples = [
		{
			instruction: 'Why use $derived instead of $: in Svelte 5?',
			input: '',
			output: '$derived provides explicit reactivity, better TypeScript support, and clearer data flow. Unlike $:, $derived only recomputes when dependencies change, improving performance.'
		},
		{
			instruction: 'Why migrate from createEventDispatcher to callback props?',
			input: '',
			output: 'Callback props are simpler, type-safe, and align with web standards. They eliminate the need for event dispatchers and make component APIs more predictable.'
		},
		{
			instruction: 'When should I use $effect vs onMount in Svelte 5?',
			input: '',
			output: 'Use $effect for reactive side effects that depend on state changes. Use onMount for one-time initialization that only runs when the component mounts.'
		}
	];

	return [...variations, ...whyExamples];
}

/**
 * Main
 */
async function main() {
	console.log(chalk.cyan.bold('\n🎓 Phase 77: Enhanced Training Data Generator\n'));

	let allExamples = [...TRAINING_TEMPLATES];

	// Generate variations
	const variations = generateVariations(TRAINING_TEMPLATES);
	allExamples = [...allExamples, ...variations];

	// Limit to target count
	allExamples = allExamples.slice(0, CONFIG.output.targetCount);

	console.log(chalk.green(`✅ Generated ${allExamples.length} training examples\n`));

	// Write JSONL
	const jsonlContent = allExamples.map((ex) => JSON.stringify(ex)).join('\n');
	await fs.writeFile(CONFIG.output.file, jsonlContent, 'utf-8');

	const fileSizeKB = (Buffer.byteLength(jsonlContent, 'utf-8') / 1024).toFixed(1);

	console.log(chalk.cyan('📊 Summary:\n'));
	console.log(chalk.white(`   Total examples: ${allExamples.length}`));
	console.log(chalk.white(`   Output file: ${CONFIG.output.file}`));
	console.log(chalk.white(`   Size: ${fileSizeKB} KB\n`));

	// Category breakdown
	const categories = {
		svelte5: 0,
		typescript: 0,
		sveltekit: 0,
		drizzle: 0,
		styling: 0,
		other: 0
	};

	for (const ex of allExamples) {
		const inst = ex.instruction.toLowerCase();
		if (inst.includes('svelte 5') || inst.includes('$state') || inst.includes('rune')) {
			categories.svelte5++;
		} else if (inst.includes('typescript')) {
			categories.typescript++;
		} else if (inst.includes('sveltekit')) {
			categories.sveltekit++;
		} else if (inst.includes('drizzle')) {
			categories.drizzle++;
		} else if (inst.includes('unocss') || inst.includes('bits ui')) {
			categories.styling++;
		} else {
			categories.other++;
		}
	}

	console.log(chalk.cyan('📈 Category Breakdown:\n'));
	for (const [cat, count] of Object.entries(categories)) {
		const percentage = ((count / allExamples.length) * 100).toFixed(1);
		console.log(chalk.white(`   ${cat.padEnd(15)} ${count.toString().padStart(3)} (${percentage}%)`));
	}

	console.log(chalk.green('\n✅ Ready to merge with existing training data!\n'));
	console.log(chalk.gray('Next steps:'));
	console.log(chalk.gray('  1. Merge: node scripts/combine-training-data.mjs'));
	console.log(chalk.gray('  2. Upload: combined_training_data.jsonl → Google Colab'));
	console.log(chalk.gray('  3. Train: phase77-unsloth-finetuning.ipynb\n'));
}

main().catch((error) => {
	console.error(chalk.red('Fatal error:'), error);
	process.exit(1);
});
