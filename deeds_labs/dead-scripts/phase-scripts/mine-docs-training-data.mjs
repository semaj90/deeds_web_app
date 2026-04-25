#!/usr/bin/env node
/**
 * 🎓 Phase 77: Documentation Mining for Training Data
 *
 * Extracts training examples from:
 * - svelte-complete.txt (Svelte 5 official docs)
 * - llms.md (Bits UI documentation)
 * - Svelte 5 code patterns from docs
 *
 * Output: docs_training_data.jsonl
 *
 * Usage:
 *   node scripts/mine-docs-training-data.mjs
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

const CONFIG = {
	docs: {
		svelte: path.join(rootDir, '..', 'svelte-complete.txt'),
		bitsUI: path.join(rootDir, 'docs_readme/organized-markdown-docs/context7-docs_docs_content/llms.md')
	},
	output: 'docs_training_data.jsonl',
	targetCount: 50
};

// 🎯 Documentation-based Training Examples
const DOC_EXAMPLES = [
	// ============================================
	// SVELTE 5 RUNES - From Official Docs
	// ============================================
	{
		instruction: 'Explain how $state creates reactive variables in Svelte 5.',
		input: '',
		output: 'The $state rune creates reactive state in Svelte 5. Unlike previous versions, state is just a regular variable that triggers UI updates when changed. Example: `let count = $state(0)` creates a reactive counter. You can update it like any JavaScript variable: `count++`. For objects and arrays, $state creates deep reactive proxies that track property changes.'
	},
	{
		instruction: 'What is the difference between $state and $state.raw in Svelte 5?',
		input: '',
		output: '$state creates deeply reactive proxies for objects/arrays, tracking all nested changes. $state.raw creates non-reactive state that can only be reassigned, not mutated. Use $state.raw for performance with large objects you don\'t plan to mutate: `let data = $state.raw({ big: "object" })`. Mutating properties has no effect; you must reassign the entire object.'
	},
	{
		instruction: 'How do I use $derived for computed values in Svelte 5?',
		input: '',
		output: '$derived creates computed values that automatically update when dependencies change. Simple syntax: `let doubled = $derived(count * 2)`. For complex logic, use $derived.by: `let total = $derived.by(() => { let sum = 0; for (const n of numbers) sum += n; return sum; })`. Dependencies are tracked automatically by reading state synchronously.'
	},
	{
		instruction: 'When should I use $effect vs onMount in Svelte 5?',
		input: '',
		output: 'Use $effect for reactive side effects that depend on state changes: `$effect(() => { console.log(count); })` runs whenever count changes. Use onMount for one-time initialization: `onMount(() => { fetchData(); })` runs only when the component mounts. $effect tracks dependencies automatically, while onMount has no dependencies.'
	},
	{
		instruction: 'Explain $props() destructuring in Svelte 5 components.',
		input: '',
		output: 'The $props() rune replaces `export let` for component props. Destructure with defaults and types: `let { name = "Guest", age }: { name?: string; age: number } = $props()`. Props are reactive automatically. You can spread remaining props: `let { class: className, ...rest } = $props()` then use `{...rest}` on child elements.'
	},
	{
		instruction: 'How do event handlers work in Svelte 5?',
		input: '',
		output: 'Svelte 5 uses standard DOM event properties instead of directives. Replace `on:click={handler}` with `onclick={handler}`. For modifiers, use standard JavaScript: `onclick={(e) => { e.preventDefault(); handler(); }}`. Event handlers are lowercase: `onclick`, `oninput`, `onsubmit`. This aligns with web standards and improves TypeScript support.'
	},
	{
		instruction: 'How do I replace createEventDispatcher in Svelte 5?',
		input: '',
		output: 'Svelte 5 replaces createEventDispatcher with callback props. Instead of dispatching events, accept callback functions: `let { onSubmit }: { onSubmit: (data: any) => void } = $props()`. Call the callback directly: `onSubmit({ data })`. This is simpler, type-safe, and follows JavaScript conventions. Parent components pass functions as props.'
	},
	{
		instruction: 'What is $state.snapshot and when should I use it?',
		input: '',
		output: '$state.snapshot takes a static snapshot of a reactive $state proxy, returning a plain JavaScript object. Use it when passing state to external libraries that don\'t expect proxies: `console.log($state.snapshot(counter))` or `structuredClone($state.snapshot(data))`. This is useful for logging, serialization, or APIs that break with proxies.'
	},
	{
		instruction: 'How do I use $effect for cleanup in Svelte 5?',
		input: '',
		output: '$effect can return a cleanup function that runs before the effect re-runs or when the component is destroyed. Example: `$effect(() => { const interval = setInterval(() => { count++; }, 1000); return () => clearInterval(interval); })`. The cleanup function is called automatically, similar to useEffect in React.'
	},
	{
		instruction: 'Explain the difference between $effect and $effect.pre in Svelte 5.',
		input: '',
		output: '$effect runs after the DOM updates, making it safe to read layout values. $effect.pre runs before the DOM updates, useful for measuring elements before changes. Example: `$effect.pre(() => { const height = element.offsetHeight; })` captures height before Svelte updates the DOM. Use $effect.pre sparingly, as it can cause layout thrashing.'
	},

	// ============================================
	// SVELTE 5 ADVANCED PATTERNS
	// ============================================
	{
		instruction: 'How do I share reactive state across modules in Svelte 5?',
		input: '',
		output: 'You can\'t directly export reassigned $state from .svelte.js modules. Instead, export an object: `export const store = $state({ count: 0 })` and mutate properties: `store.count++`. Or export getter functions: `let count = $state(0); export const getCount = () => count; export const increment = () => count++;`. This prevents reference issues across module boundaries.'
	},
	{
		instruction: 'How do I use $state in TypeScript class fields?',
		input: '',
		output: 'Declare $state in class fields (public or private) or as the first assignment in the constructor: `class Todo { done = $state(false); #text = $state(""); constructor(text) { this.text = $state(text); } }`. Methods are not reactive. Use arrow functions to preserve `this` context: `reset = () => { this.done = false; }`.'
	},
	{
		instruction: 'What are the rules for $derived dependencies in Svelte 5?',
		input: '',
		output: 'Anything read synchronously inside $derived is a dependency. The derived recalculates when dependencies change. To exclude state from dependencies, use untrack(): `let derived = $derived(untrack(() => ignoreThis) + trackThis)`. Avoid side effects in derivations - Svelte disallows state changes like `count++` inside $derived.'
	},
	{
		instruction: 'How do I override derived values temporarily in Svelte 5?',
		input: '',
		output: 'You can reassign $derived values (unless const) for optimistic UI. The derived recalculates when dependencies change, but your override persists until then: `let likes = $derived(post.likes); async function like() { likes += 1; try { await api.like(); } catch { likes -= 1; } }`. This shows immediate feedback while the server updates.'
	},
	{
		instruction: 'How does Svelte 5 handle reactivity with destructuring?',
		input: '',
		output: 'Destructuring a $derived creates reactive variables for each property: `let { a, b, c } = $derived(stuff())` is equivalent to `let _stuff = $derived(stuff()); let a = $derived(_stuff.a);` etc. With $state, destructuring creates non-reactive references evaluated at destruction time: `let { count } = state; state.count++; // count variable unchanged`.'
	},

	// ============================================
	// SVELTEKIT ADVANCED PATTERNS
	// ============================================
	{
		instruction: 'How do I use SvelteKit load functions with Svelte 5 runes?',
		input: '',
		output: 'Load functions return data as props. In Svelte 5, destructure with $props(): `let { data } = $props<{ data: PageData }>()`. The data is reactive automatically. For streaming, use promises: `export const load = async () => ({ streamed: fetch(url).then(r => r.json()) })` then await in the component: `{#await data.streamed then result}...{/await}`.'
	},
	{
		instruction: 'How do SvelteKit form actions work with Svelte 5?',
		input: '',
		output: 'Form actions are server-side POST handlers. Use enhance for progressive enhancement: `import { enhance } from "$app/forms"; <form method="POST" use:enhance>`. Actions return validation errors via fail(): `if (!email) return fail(400, { email, missing: true })`. Access action data with $props(): `let { form } = $props()` then show errors: `{#if form?.missing}Required{/if}`.'
	},
	{
		instruction: 'How do I handle optimistic UI in SvelteKit with Svelte 5?',
		input: '',
		output: 'Use $derived to derive from form data, then override temporarily: `let items = $derived(data.items); async function add() { items = [...items, newItem]; const result = await fetch("/api", { method: "POST" }); if (!result.ok) items = data.items; }`. The derived resets when data changes from invalidation.'
	},
	{
		instruction: 'How do I share state between layouts and pages in SvelteKit with Svelte 5?',
		input: '',
		output: 'Use setContext/getContext for reactive state sharing. In +layout.svelte: `import { setContext } from "svelte"; let user = $state(null); setContext("user", { get current() { return user }, set(v) { user = v } })`. In child pages: `const userCtx = getContext("user"); let currentUser = $derived(userCtx.current)`. This creates reactive communication between components.'
	},

	// ============================================
	// BITS UI PATTERNS
	// ============================================
	{
		instruction: 'How do I access LLM-friendly Bits UI documentation?',
		input: '',
		output: 'Bits UI provides LLM-optimized docs following the llms.txt standard. Access any component docs by appending /llms.txt to the URL: `https://bits-ui.com/docs/components/accordion/llms.txt`. For all docs in one file, use `https://bits-ui.com/docs/llms.txt`. The root index at `https://bits-ui.com/llms.txt` lists all available endpoints. Use the "Copy Markdown" button on any page for the same content.'
	},
	{
		instruction: 'How do I use Bits UI Dialog component with Svelte 5?',
		input: '',
		output: 'Import Dialog parts: `import { Dialog } from "bits-ui"`. Use with Svelte 5: `<Dialog.Root bind:open={isOpen}><Dialog.Trigger>Open</Dialog.Trigger><Dialog.Portal><Dialog.Overlay /><Dialog.Content><Dialog.Title>Title</Dialog.Title><Dialog.Description>Description</Dialog.Description></Dialog.Content></Dialog.Portal></Dialog.Root>`. Bind open state with $state: `let isOpen = $state(false)`.'
	},
	{
		instruction: 'How do I style Bits UI components with UnoCSS in Svelte 5?',
		input: '',
		output: 'Bits UI components are headless and unstyled. Apply UnoCSS classes directly: `<Dialog.Trigger class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">`. For data attributes, use UnoCSS attribute selectors: `<Dialog.Content class="p-6 bg-white rounded-lg shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out">`. Combine with Svelte 5 class directives: `class:active={isActive}`.'
	},

	// ============================================
	// MIGRATION PATTERNS
	// ============================================
	{
		instruction: 'Migrate Svelte 4 beforeUpdate to Svelte 5.',
		input: 'import { beforeUpdate } from "svelte";\nbeforeUpdate(() => {\n  console.log("about to update");\n});',
		output: 'Use $effect.pre for logic before DOM updates: `$effect.pre(() => { console.log("about to update"); })`. Unlike beforeUpdate, $effect.pre automatically tracks dependencies and re-runs when they change. For one-time logic, keep it in the script top level or use onMount if it\'s initialization.'
	},
	{
		instruction: 'Migrate Svelte 4 afterUpdate to Svelte 5.',
		input: 'import { afterUpdate } from "svelte";\nafterUpdate(() => {\n  console.log("just updated");\n});',
		output: 'Use $effect for logic after DOM updates: `$effect(() => { console.log("just updated"); })`. $effect runs after every render where dependencies change, similar to afterUpdate but with automatic dependency tracking. For one-time post-mount logic, use onMount instead.'
	},
	{
		instruction: 'Migrate Svelte 4 tick() to Svelte 5.',
		input: 'import { tick } from "svelte";\nawait tick();\nconsole.log(element.offsetHeight);',
		output: 'Use $effect.pre to measure before DOM updates, or $effect for after. For awaiting DOM updates, tick() still works in Svelte 5: `import { tick } from "svelte"; await tick(); console.log(element.offsetHeight)`. In most cases, $effect is better: `$effect(() => { console.log(element.offsetHeight); })` runs automatically when dependencies change.'
	},
	{
		instruction: 'Migrate Svelte 4 component events to Svelte 5.',
		input: '<Child on:message={handleMessage} />',
		output: 'Replace component events with callback props. In Child: `let { onMessage }: { onMessage: (data: string) => void } = $props()`. Call it: `onMessage("hello")`. In Parent: `<Child onMessage={handleMessage} />`. This is simpler and type-safe. For multiple events, use multiple callback props: `onMessage`, `onError`, `onClose`.'
	},
	{
		instruction: 'Migrate Svelte 4 slot props to Svelte 5.',
		input: '<slot user={currentUser} />',
		output: 'Svelte 5 uses snippet for slot props. Define a snippet: `{#snippet userSlot(user: User)}<div>{user.name}</div>{/snippet}`. Pass it as a prop: `<Component user={userSlot} />`. In Component, render with `{@render user(currentUser)}`. This is more flexible and type-safe than traditional slots with props.'
	},

	// ============================================
	// TESTING & DEBUGGING
	// ============================================
	{
		instruction: 'How do I test Svelte 5 components with $state using Vitest?',
		input: '',
		output: 'Use @testing-library/svelte with Svelte 5 runes: `import { render, screen } from "@testing-library/svelte"; import { expect, test } from "vitest"; test("counter increments", async () => { const { component } = render(Counter); await component.increment(); expect(screen.getByText("Count: 1")).toBeInTheDocument(); })`. Access component methods directly or use fireEvent for DOM interactions.'
	},
	{
		instruction: 'How do I debug $derived values in Svelte 5?',
		input: '',
		output: 'Use $inspect() rune to log reactive values: `$inspect(count, doubled)` logs whenever they change. For derivations, add console.log inside $derived.by: `let total = $derived.by(() => { const sum = arr.reduce((a, b) => a + b, 0); console.log("recalculating:", sum); return sum; })`. Use $effect for side-effect logging: `$effect(() => console.log("count changed:", count))`.'
	},
	{
		instruction: 'How do I handle errors in Svelte 5 components?',
		input: '',
		output: 'Use error boundaries with the boundary prop: `<svelte:boundary onerror={handleError}>`. The error handler receives the error: `function handleError(error) { console.error(error); showErrorUI(); }`. Error boundaries catch rendering errors and top-level $effect errors, but NOT event handler errors. For event errors, use try-catch: `onclick={async () => { try { await action(); } catch (e) { handleError(e); } }}`.'
	},

	// ============================================
	// PERFORMANCE
	// ============================================
	{
		instruction: 'How do I optimize Svelte 5 component re-renders?',
		input: '',
		output: 'Use $derived for computed values to avoid recalculation. Use untrack() to exclude non-essential dependencies: `let filtered = $derived(items.filter(i => untrack(() => config.debug) || i.active))`. Avoid unnecessary effects - Svelte updates are already granular. Use $state.raw for large objects you won\'t mutate. Split components to isolate reactivity.'
	},
	{
		instruction: 'When should I use $state.raw for performance?',
		input: '',
		output: 'Use $state.raw for large arrays/objects you won\'t mutate: `let bigData = $state.raw(largeArray)`. This avoids proxy overhead. You can only reassign, not mutate: `bigData = newArray` works, but `bigData[0] = x` doesn\'t trigger updates. Good for immutable data patterns or data from APIs that you replace entirely.'
	},
	{
		instruction: 'How do I lazy load components in Svelte 5?',
		input: '',
		output: 'Use dynamic imports with {#await}: `<script>let HeavyComponent = $state(null);</script>{#if shouldLoad}{#await import("./Heavy.svelte") then { default: Component }}<svelte:component this={Component} />{/await}{/if}`. Or with $derived: `let Component = $derived.by(async () => shouldLoad ? (await import("./Heavy.svelte")).default : null)` then `{#if Component}<svelte:component this={Component} />{/if}`.'
	}
];

/**
 * Extract additional examples from Svelte docs
 */
async function extractFromSvelteDocs() {
	try {
		const content = await fs.readFile(CONFIG.docs.svelte, 'utf-8');
		const examples = [];

		// Extract code blocks with explanations
		const codeBlockRegex = /```svelte\n([\s\S]*?)```/g;
		let match;
		let count = 0;

		while ((match = codeBlockRegex.exec(content)) && count < 10) {
			const code = match[1].trim();
			if (code.includes('$state') || code.includes('$derived') || code.includes('$effect') || code.includes('$props')) {
				examples.push({
					instruction: `Explain this Svelte 5 code pattern.`,
					input: code,
					output: `This code demonstrates Svelte 5 runes syntax. ${code.includes('$state') ? 'Uses $state for reactive state.' : ''} ${code.includes('$derived') ? 'Uses $derived for computed values.' : ''} ${code.includes('$effect') ? 'Uses $effect for side effects.' : ''} ${code.includes('$props') ? 'Uses $props for component props.' : ''}`
				});
				count++;
			}
		}

		return examples;
	} catch (err) {
		console.log(chalk.yellow(`   ⚠️  Could not read Svelte docs: ${err.message}`));
		return [];
	}
}

/**
 * Main
 */
async function main() {
	console.log(chalk.cyan.bold('\n🎓 Phase 77: Documentation Mining\n'));

	let allExamples = [...DOC_EXAMPLES];

	// Extract from docs
	console.log(chalk.gray('   Extracting from Svelte documentation...'));
	const svelteExamples = await extractFromSvelteDocs();
	allExamples = [...allExamples, ...svelteExamples];

	// Limit to target
	allExamples = allExamples.slice(0, CONFIG.targetCount);

	console.log(chalk.green(`\n✅ Generated ${allExamples.length} documentation examples\n`));

	// Write JSONL
	const jsonlContent = allExamples.map((ex) => JSON.stringify(ex)).join('\n');
	await fs.writeFile(CONFIG.output, jsonlContent, 'utf-8');

	const fileSizeKB = (Buffer.byteLength(jsonlContent, 'utf-8') / 1024).toFixed(1);

	console.log(chalk.cyan('📊 Summary:\n'));
	console.log(chalk.white(`   Total examples: ${allExamples.length}`));
	console.log(chalk.white(`   Output file: ${CONFIG.output}`));
	console.log(chalk.white(`   Size: ${fileSizeKB} KB\n`));

	// Category breakdown
	const categories = {
		runes: 0,
		migration: 0,
		sveltekit: 0,
		bitsUI: 0,
		testing: 0,
		performance: 0,
		other: 0
	};

	for (const ex of allExamples) {
		const inst = ex.instruction.toLowerCase();
		if (inst.includes('$state') || inst.includes('$derived') || inst.includes('rune')) {
			categories.runes++;
		} else if (inst.includes('migrate') || inst.includes('svelte 4')) {
			categories.migration++;
		} else if (inst.includes('sveltekit')) {
			categories.sveltekit++;
		} else if (inst.includes('bits ui')) {
			categories.bitsUI++;
		} else if (inst.includes('test') || inst.includes('debug')) {
			categories.testing++;
		} else if (inst.includes('performance') || inst.includes('optimize')) {
			categories.performance++;
		} else {
			categories.other++;
		}
	}

	console.log(chalk.cyan('📈 Category Breakdown:\n'));
	for (const [cat, count] of Object.entries(categories)) {
		if (count > 0) {
			const percentage = ((count / allExamples.length) * 100).toFixed(1);
			console.log(chalk.white(`   ${cat.padEnd(15)} ${count.toString().padStart(3)} (${percentage}%)`));
		}
	}

	console.log(chalk.green('\n✅ Ready to merge with existing datasets!\n'));
	console.log(chalk.gray('Next: Update combine-training-data.mjs to include docs_training_data.jsonl\n'));
}

main().catch((error) => {
	console.error(chalk.red('Fatal error:'), error);
	process.exit(1);
});
