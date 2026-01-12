/**
 * Phase 96: Comprehensive Svelte 5 Component Validator & Fixer
 *
 * Validates and fixes:
 * 1. Svelte 5 runes usage ($props, $state, $derived, $effect)
 * 2. Component exports and prop declarations
 * 3. Event handlers (onclick vs on:click)
 * 4. Snippet syntax {@render snippet} vs {#snippet}
 * 5. Reactive statements ($: removal)
 * 6. Store subscriptions ($store vs store.value)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, '..');
const SRC_DIR = join(PROJECT_ROOT, 'src');

let filesFixed = 0;
let totalFixes = 0;
const errorLog = [];

const fixes = [
	// 1. Fix export let → $props()
	{
		pattern: /export\s+let\s+(\w+)(?:\s*:\s*([^;=]+))?\s*(?:=\s*([^;]+))?;/g,
		validate: (content) => {
			// Only fix if not already using $props
			return !content.includes('let { ') && !content.includes('$props()');
		},
		replacement: (match, propName, type, defaultValue) => {
			// Store for conversion to $props later
			return `// TODO: Convert to $props - export let ${propName}${type ? ': ' + type : ''}${defaultValue ? ' = ' + defaultValue : ''};`;
		},
		description: 'Mark export let for manual $props conversion',
	},

	// 2. Fix reactive declarations ($: x = y → let x = $derived(y))
	{
		pattern: /\$:\s+(\w+)\s*=\s*([^;]+);/g,
		replacement: 'let $1 = $derived($2);',
		description: 'Convert $: reactive declarations to $derived',
	},

	// 3. Fix on:click to onclick
	{
		pattern: /on:click=/g,
		replacement: 'onclick=',
		description: 'Convert on:click to onclick',
	},

	// 4. Fix on:submit to onsubmit
	{
		pattern: /on:submit=/g,
		replacement: 'onsubmit=',
		description: 'Convert on:submit to onsubmit',
	},

	// 5. Fix on:input to oninput
	{
		pattern: /on:input=/g,
		replacement: 'oninput=',
		description: 'Convert on:input to oninput',
	},

	// 6. Fix on:change to onchange
	{
		pattern: /on:change=/g,
		replacement: 'onchange=',
		description: 'Convert on:change to onchange',
	},

	// 7. Fix bind:value to bind:value (ensure correct syntax)
	{
		pattern: /bind:value\s*=\s*{([^}]+)}\s*(?![\/\s>])/g,
		validate: (content, match) => {
			// Check if not properly closed
			return !match.includes('/>') && !match.includes('</');
		},
		replacement: 'bind:value={$1}',
		description: 'Fix bind:value syntax',
	},

	// 8. Fix class: directives
	{
		pattern: /class:(\w+)\s*=\s*{([^}]+)}/g,
		replacement: 'class:$1={$2}',
		description: 'Normalize class: directive syntax',
	},

	// 9. Fix transition: directives
	{
		pattern: /transition:(\w+)\s*=\s*{{([^}]+)}}/g,
		replacement: 'transition:$1={{$2}}',
		description: 'Fix transition directive syntax',
	},

	// 10. Fix use: directives
	{
		pattern: /use:(\w+)\s*=\s*{{([^}]+)}}/g,
		replacement: 'use:$1={{$2}}',
		description: 'Fix use directive syntax',
	},

	// 11. Ensure <script> has lang="ts" for TypeScript files
	{
		pattern: /<script>(?!\s*lang)/g,
		validate: (content, match, filePath) => {
			return filePath.endsWith('.svelte') && content.includes('interface ') || content.includes('type ');
		},
		replacement: '<script lang="ts">',
		description: 'Add lang="ts" to TypeScript <script> tags',
	},

	// 12. Fix incorrect snippet rendering
	{
		pattern: /{#snippet\s+(\w+)\(([^)]*)\)}\s*\{@render\s+\1\(([^)]*)\)\}/g,
		replacement: '{#snippet $1($2)}\n  <!-- snippet content here -->\n{/snippet}',
		description: 'Fix incorrect snippet+render combo',
	},

	// 13. Fix store subscriptions in templates
	{
		pattern: /{\$(\w+Store)}/g,
		validate: (content, match) => {
			// Check if it's actually a rune, not a store
			return !content.includes('$state') && !content.includes('$derived');
		},
		replacement: '{$1}',
		description: 'Remove $ from non-store reactive values',
	},
];

function applyFixes(content, filePath) {
	let fixCount = 0;
	let result = content;
	const appliedFixes = [];

	for (const fix of fixes) {
		try {
			// Check validation if present
			if (fix.validate && !fix.validate(result, null, filePath)) {
				continue;
			}

			const matches = result.match(fix.pattern);
			if (matches) {
				const beforeLength = result.length;

				if (typeof fix.replacement === 'function') {
					result = result.replace(fix.pattern, fix.replacement);
				} else {
					result = result.replace(fix.pattern, fix.replacement);
				}

				const count = matches.length;
				if (result !== content && result.length !== beforeLength) {
					fixCount += count;
					appliedFixes.push({ description: fix.description, count });
				}
			}
		} catch (error) {
			errorLog.push({
				file: relative(PROJECT_ROOT, filePath),
				fix: fix.description,
				error: error.message
			});
		}
	}

	return { content: result, fixCount, appliedFixes };
}

function validateSvelte5Component(content, filePath) {
	const issues = [];

	// Check for Svelte 5 patterns
	const hasOldExports = /export\s+let\s+\w+/.test(content);
	const hasNewProps = /\{\s*\w+\s*\}\s*=\s*\$props\(\)/.test(content);
	const hasOldReactive = /\$:\s+\w+\s*=/.test(content);
	const hasOldEvents = /on:\w+=/i.test(content);

	if (hasOldExports && !hasNewProps) {
		issues.push('Component uses old export let pattern - needs $props() conversion');
	}

	if (hasOldReactive) {
		issues.push('Component uses old $: reactive statements - needs $derived conversion');
	}

	if (hasOldEvents) {
		issues.push('Component uses old on:event handlers - needs onclick conversion');
	}

	return issues;
}

function processFile(filePath) {
	try {
		const content = readFileSync(filePath, 'utf-8');
		const { content: fixed, fixCount, appliedFixes } = applyFixes(content, filePath);

		// Validate Svelte 5 compliance
		const issues = filePath.endsWith('.svelte') ? validateSvelte5Component(fixed, filePath) : [];

		if (fixCount > 0) {
			writeFileSync(filePath, fixed, 'utf-8');
			console.log(`\n📝 Fixed: ${relative(PROJECT_ROOT, filePath)}`);

			appliedFixes.forEach(({ description, count }) => {
				console.log(`  ✅ ${description}: ${count} fixes`);
			});

			if (issues.length > 0) {
				console.log(`  ⚠️  Remaining issues:`);
				issues.forEach(issue => console.log(`     - ${issue}`));
			}

			filesFixed++;
			totalFixes += fixCount;
			return true;
		} else if (issues.length > 0) {
			console.log(`\n⚠️  ${relative(PROJECT_ROOT, filePath)}`);
			issues.forEach(issue => console.log(`   - ${issue}`));
		}

		return false;
	} catch (error) {
		console.error(`❌ Error processing ${filePath}:`, error.message);
		errorLog.push({
			file: relative(PROJECT_ROOT, filePath),
			error: error.message
		});
		return false;
	}
}

function processDirectory(dir) {
	const entries = readdirSync(dir);

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);

		// Skip excluded directories
		if (
			entry === 'node_modules' ||
			entry === '.git' ||
			entry === '.svelte-kit' ||
			entry === 'build' ||
			entry === 'dist' ||
			entry.startsWith('.')
		) {
			continue;
		}

		if (stat.isDirectory()) {
			processDirectory(fullPath);
		} else if (stat.isFile()) {
			// Process Svelte components
			if (fullPath.endsWith('.svelte')) {
				processFile(fullPath);
			}
		}
	}
}

function main() {
	console.log('🔧 Phase 96: Svelte 5 Component Validator & Fixer');
	console.log('═'.repeat(80));
	console.log('');

	console.log('📂 Processing directory:', SRC_DIR);
	console.log('');

	const startTime = Date.now();

	processDirectory(SRC_DIR);

	const duration = ((Date.now() - startTime) / 1000).toFixed(2);

	console.log('');
	console.log('═'.repeat(80));
	console.log('📊 Summary:');
	console.log(`✅ Files fixed: ${filesFixed}`);
	console.log(`🔧 Total fixes applied: ${totalFixes}`);
	console.log(`⏱️  Duration: ${duration}s`);

	if (errorLog.length > 0) {
		console.log(`\n⚠️  Errors encountered: ${errorLog.length}`);
		console.log('See error-log.json for details');
		writeFileSync('error-log.json', JSON.stringify(errorLog, null, 2));
	}

	console.log('═'.repeat(80));

	if (filesFixed > 0) {
		console.log('');
		console.log('✅ Next steps:');
		console.log('  1. Review TODO comments for manual $props conversions');
		console.log('  2. Test components with: npm run dev:quic');
		console.log('  3. Run: npx playwright test tests/phase96-all-routes-mcp.spec.ts');
	}
}

main();
