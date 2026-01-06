#!/usr/bin/env node
/**
 * Agentic Corruption Pattern Fixer
 * Uses LLM-guided pattern matching to fix TypeScript corruption
 * Patterns: colon-instead-of-comma, missing parens, type syntax errors
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Corruption patterns detected from WebGPU/LangChain/TypeScript analysis
const CORRUPTION_PATTERNS = [
	// Pattern 1: Import type corruption - "import type: { X } from: 'y'"
	{
		name: 'import_type_colon',
		pattern: /import type:\s*\{([^}]+)\}\s*from:\s*['"]([^'"]+)['"]/g,
		fix: (match, imports, source) => `import type { ${imports.trim()} } from '${source}'`
	},

	// Pattern 2: Function parameter corruption - "function name(param, Type)"
	{
		name: 'function_param_comma_type',
		pattern: /\(([a-zA-Z0-9_]+),\s*([A-Z][a-zA-Z0-9<>[\]|&]+)\)/g,
		fix: (match, param, type) => `(${param}: ${type})`
	},

	// Pattern 3: Interface corruption - "interface X: {,;"
	{
		name: 'interface_colon_bracket',
		pattern: /interface\s+([A-Z][a-zA-Z0-9]+):\s*\{[,;]?/g,
		fix: (match, name) => `interface ${name} {`
	},

	// Pattern 4: Type corruption - "type X = Y:"
	{
		name: 'type_trailing_colon',
		pattern: /type\s+([A-Z][a-zA-Z0-9]+)\s*=\s*([^;{]+):/g,
		fix: (match, name, def) => `type ${name} = ${def.trim()};`
	},

	// Pattern 5: Object property corruption - "key, value" instead of "key: value"
	{
		name: 'object_prop_comma',
		pattern: /\{\s*([a-zA-Z0-9_]+),\s*([a-zA-Z0-9_\.]+)/g,
		fix: (match, key, value) => `{ ${key}: ${value}`
	},

	// Pattern 6: Missing closing paren with colon - "func(arg, next:"
	{
		name: 'missing_paren_colon',
		pattern: /([a-zA-Z0-9_]+)\(([^)]+),\s*([a-zA-Z0-9_]+):/g,
		fix: (match, func, args, next) => `${func}(${args}), ${next}:`
	},

	// Pattern 7: Return type corruption - "): type :" should be "): type {"
	{
		name: 'return_type_colon',
		pattern: /\):\s*([A-Z][a-zA-Z0-9<>[\]|&\s]+)\s*:/g,
		fix: (match, type) => `): ${type.trim()} {`
	},

	// Pattern 8: Generic type corruption - "<T, U>" instead of "<T, U>"
	{
		name: 'generic_comma_space',
		pattern: /<([A-Z][a-zA-Z0-9]*),([A-Z][a-zA-Z0-9]*)>/g,
		fix: (match, t1, t2) => `<${t1}, ${t2}>`
	},

	// Pattern 9: Array type corruption - "Array<T>:" should be "Array<T>"
	{
		name: 'array_type_colon',
		pattern: /(Array|Promise|Record)<([^>]+)>:/g,
		fix: (match, wrapper, inner) => `${wrapper}<${inner}>`
	},

	// Pattern 10: Statement terminator corruption - "), key:" should be "); key:"
	{
		name: 'statement_paren_comma',
		pattern: /\),\s*([a-zA-Z0-9_]+):/g,
		fix: (match, next) => `); ${next}:`
	},

	// Pattern 11: Interface property corruption - "key?, type;" instead of "key?: type;"
	{
		name: 'interface_prop_comma',
		pattern: /([a-zA-Z0-9_]+\??)\s*,\s*([a-zA-Z0-9_\[\]\|]+)\s*;/g,
		fix: (match, key, type) => `${key}: ${type};`
	},

	// Pattern 12: Method/Function argument corruption - "func(a: T); b: T)" or "func(a); b)"
	{
		name: 'arg_separator_semicolon',
		pattern: /\(([^)]+);\s*([^)]+)\)/g,
		fix: (match, arg1, arg2) => `(${arg1}, ${arg2})`
	},
	{
		name: 'arg_separator_semicolon_split',
		pattern: /\(([^)]+)\);\s*([^)]+)\)/g,
		fix: (match, arg1, arg2) => `(${arg1}, ${arg2})`
	},

	// Pattern 13: Stray leading semicolons
	{
		name: 'stray_leading_semicolon',
		pattern: /^\s*;\s+/gm, // Match valid indentation followed by semicolon at start of line
		fix: (match) => match.replace(';', '')
	}
];

// Apply patterns to file content
function applyPatterns(content, filename) {
	let fixed = content;
	let changesMade = [];

	for (const pattern of CORRUPTION_PATTERNS) {
		const before = fixed;
		fixed = fixed.replace(pattern.pattern, pattern.fix);

		if (before !== fixed) {
			const changes = (before.match(pattern.pattern) || []).length;
			changesMade.push({ pattern: pattern.name, changes });
			console.log(`  ✓ ${pattern.name}: ${changes} fixes`);
		}
	}

	return { fixed, changesMade };
}

// Validate with TypeScript/svelte-check
function validateFile(filepath) {
	try {
		const result = execSync(
			`npx svelte-check --threshold error --fail-on-warnings false --output machine --file "${filepath}" 2>&1`,
			{ encoding: 'utf8', cwd: rootDir }
		);

		const errorLines = result.split('\n').filter(line =>
			line.includes('ERROR') || line.includes('error TS')
		);

		return {
			valid: errorLines.length === 0,
			errors: errorLines.length,
			details: errorLines.slice(0, 5)
		};
	} catch (error) {
		return {
			valid: false,
			errors: -1,
			details: ['Validation failed']
		};
	}
}

// Main processing function
async function processFile(filepath) {
	console.log(`\n📄 Processing: ${filepath}`);

	try {
		// Read original content
		const originalContent = readFileSync(filepath, 'utf8');

		// Validate before fixing
		console.log('  ⏳ Validating original...');
		const beforeValidation = validateFile(filepath);
		console.log(`  📊 Before: ${beforeValidation.errors} errors`);

		// Apply corruption patterns
		console.log('  🔧 Applying pattern fixes...');
		const { fixed, changesMade } = applyPatterns(originalContent, filepath);

		if (changesMade.length === 0) {
			console.log('  ℹ️  No patterns matched - file may be clean');
			return { success: false, reason: 'no_changes' };
		}

		// Write fixed content
		const backupPath = filepath + '.backup';
		writeFileSync(backupPath, originalContent, 'utf8');
		writeFileSync(filepath, fixed, 'utf8');

		// Validate after fixing
		console.log('  ⏳ Validating fixes...');
		const afterValidation = validateFile(filepath);
		console.log(`  📊 After: ${afterValidation.errors} errors`);

		const improvement = beforeValidation.errors - afterValidation.errors;

		if (improvement > 0) {
			console.log(`  ✅ Success! Fixed ${improvement} errors`);
			return { success: true, improvement, changesMade };
		} else if (improvement === 0 && afterValidation.errors === 0) {
			console.log(`  ✅ File is now error-free!`);
			return { success: true, improvement: beforeValidation.errors, changesMade };
		} else {
			console.log(`  ⚠️  Warning: Error count changed by ${improvement}`);
			if (afterValidation.errors > beforeValidation.errors) {
				// Restore backup if we made things worse
				writeFileSync(filepath, originalContent, 'utf8');
				console.log('  ↩️  Restored from backup');
				return { success: false, reason: 'regression', details: afterValidation.details };
			}
			return { success: true, improvement, changesMade };
		}

	} catch (error) {
		console.error(`  ❌ Error: ${error.message}`);
		return { success: false, reason: 'exception', error: error.message };
	}
}

// CLI interface
const args = process.argv.slice(2);

if (args.length === 0) {
	console.log(`
🤖 Agentic Corruption Pattern Fixer
Usage:
  node agentic-corruption-fixer.mjs <file1> [file2] [file3]...
  node agentic-corruption-fixer.mjs --all-errors

Patterns detected (from WebGPU/LangChain/TypeScript docs):
${CORRUPTION_PATTERNS.map(p => `  - ${p.name}`).join('\n')}
	`);
	process.exit(1);
}

if (args[0] === '--all-errors') {
	console.log('🔍 Scanning for files with errors...');

	try {
		const output = execSync(
			'npx svelte-check --threshold error --output machine 2>&1',
			{ encoding: 'utf8', cwd: rootDir }
		);

		const errorFiles = new Set();
		output.split('\n').forEach(line => {
			const match = line.match(/^([^:]+):/);
			if (match && match[1].endsWith('.ts')) {
				errorFiles.add(join(rootDir, match[1]));
			}
		});

		console.log(`📊 Found ${errorFiles.size} files with errors`);

		for (const file of errorFiles) {
			await processFile(file);
		}

	} catch (error) {
		console.error('❌ Failed to scan for errors:', error.message);
		process.exit(1);
	}
} else {
	// Process specific files
	for (const file of args) {
		const filepath = join(rootDir, file);
		await processFile(filepath);
	}
}

console.log('\n✨ Agentic pattern fixing complete!');
