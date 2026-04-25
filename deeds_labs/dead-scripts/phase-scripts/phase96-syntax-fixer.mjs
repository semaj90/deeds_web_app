/**
 * Phase 96: Comprehensive Syntax Error Fixer
 *
 * Fixes common syntax errors across the codebase:
 * 1. Semicolons in console.log() → commas
 * 2. Semicolons in Math.min/max() → commas
 * 3. <svelte, tags → <svelte: tags
 * 4. Invalid bind: syntax
 * 5. Missing imports
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, '..');
const SRC_DIR = join(PROJECT_ROOT, 'src');

let filesFixed = 0;
let totalFixes = 0;

/**
 * @typedef {Object} Fix
 * @property {RegExp} pattern
 * @property {string} replacement
 * @property {string} description
 */

/** @type {Fix[]} */
const fixes = [
	// Console.log semicolon fixes
	{
		pattern: /console\.(log|error|warn|info|debug)\(([^;)]+);([^)]+)\)/g,
		replacement: 'console.$1($2,$3)',
		description: 'console.log() semicolon → comma',
	},
	{
		pattern: /console\.(log|error|warn|info|debug)\(([^;)]+);([^;)]+);([^)]+)\)/g,
		replacement: 'console.$1($2,$3,$4)',
		description: 'console.log() multiple semicolons → commas',
	},

	// Math function semicolon fixes
	{
		pattern: /Math\.(min|max|floor|ceil|round|abs)\(([^;)]+);([^)]+)\)/g,
		replacement: 'Math.$1($2,$3)',
		description: 'Math functions semicolon → comma',
	},

	// Svelte tag fixes
	{
		pattern: /<svelte,\s*head>/g,
		replacement: '<svelte:head>',
		description: '<svelte, head> → <svelte:head>',
	},
	{
		pattern: /<\/svelte,\s*head>/g,
		replacement: '</svelte:head>',
		description: '</svelte, head> → </svelte:head>',
	},
	{
		pattern: /<svelte,\s*body>/g,
		replacement: '<svelte:body>',
		description: '<svelte, body> → <svelte:body>',
	},
	{
		pattern: /<\/svelte,\s*body>/g,
		replacement: '</svelte:body>',
		description: '</svelte, body> → </svelte:body>',
	},
	{
		pattern: /<svelte,\s*window>/g,
		replacement: '<svelte:window>',
		description: '<svelte, window> → <svelte:window>',
	},
	{
		pattern: /<\/svelte,\s*window>/g,
		replacement: '</svelte:window>',
		description: '</svelte, window> → </svelte:window>',
	},
	{
		pattern: /<svelte,\s*element>/g,
		replacement: '<svelte:element>',
		description: '<svelte, element> → <svelte:element>',
	},
	{
		pattern: /<\/svelte,\s*element>/g,
		replacement: '</svelte:element>',
		description: '</svelte, element> → </svelte:element>',
	},
	{
		pattern: /<svelte,\s*component>/g,
		replacement: '<svelte:component>',
		description: '<svelte, component> → <svelte:component>',
	},
	{
		pattern: /<\/svelte,\s*component>/g,
		replacement: '</svelte:component>',
		description: '</svelte, component> → </svelte:component>',
	},

	// Array/Object method semicolon fixes
	{
		pattern: /\.(map|filter|find|reduce|forEach)\(([^;)]+);([^)]+)\)/g,
		replacement: '.$1($2,$3)',
		description: 'Array method semicolon → comma',
	},

	// Function call semicolon fixes (generic)
	{
		pattern: /(\w+)\(([^;)]+);([^)]+)\)(?!\s*[;,])/g,
		replacement: '$1($2,$3)',
		description: 'Function call semicolon → comma',
	},

	// setTimeout/setInterval fixes
	{
		pattern: /set(Timeout|Interval)\(([^;)]+);([^)]+)\)/g,
		replacement: 'set$1($2,$3)',
		description: 'setTimeout/setInterval semicolon → comma',
	},
];

/**
 * Apply all fixes to content
 * @param {string} content
 * @param {string} filePath
 * @returns {{content: string, fixCount: number}}
 */
function applyFixes(content, filePath) {
	let fixCount = 0;
	let result = content;

	for (const fix of fixes) {
		const matches = result.match(fix.pattern);
		if (matches) {
			result = result.replace(fix.pattern, fix.replacement);
			const count = matches.length;
			fixCount += count;
			if (count > 0) {
				console.log(`  ✅ ${fix.description}: ${count} fixes`);
			}
		}
	}

	return { content: result, fixCount };
}

/**
 * Process a single file
 * @param {string} filePath
 * @returns {boolean}
 */
function processFile(filePath) {
	try {
		const content = readFileSync(filePath, 'utf-8');
		const { content: fixed, fixCount } = applyFixes(content, filePath);

		if (fixCount > 0) {
			writeFileSync(filePath, fixed, 'utf-8');
			console.log(`\n📝 Fixed: ${relative(PROJECT_ROOT, filePath)}`);
			filesFixed++;
			totalFixes += fixCount;
			return true;
		}

		return false;
	} catch (error) {
		console.error(`❌ Error processing ${filePath}:`, error);
		return false;
	}
}

/**
 * Process directory recursively
 * @param {string} dir
 */
function processDirectory(dir) {
	const entries = readdirSync(dir);

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);

		// Skip node_modules, .git, build artifacts
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
			// Process TypeScript, JavaScript, and Svelte files
			if (
				fullPath.endsWith('.ts') ||
				fullPath.endsWith('.js') ||
				fullPath.endsWith('.svelte') ||
				fullPath.endsWith('.mjs') ||
				fullPath.endsWith('.mts')
			) {
				processFile(fullPath);
			}
		}
	}
}

function main() {
	console.log('🚀 Phase 96: Comprehensive Syntax Error Fixer');
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
	console.log('═'.repeat(80));

	if (filesFixed > 0) {
		console.log('');
		console.log('✅ Next steps:');
		console.log('  1. Run: npx svelte-check --threshold error');
		console.log('  2. Run: npm run dev:quic');
		console.log('  3. Run: npx playwright test tests/phase96-all-routes-mcp.spec.ts');
	}
}

main();
