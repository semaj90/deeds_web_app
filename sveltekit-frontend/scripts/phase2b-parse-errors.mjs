#!/usr/bin/env node
/**
 * Phase 2B: Improved Error Parser for svelte-check output
 */

import fs from 'fs';
import path from 'path';

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  📊 PARSING SVELTE-CHECK ERROR REPORT                       ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const reportsDir = path.join(process.cwd(), 'reports');
const latestReport = fs.readdirSync(reportsDir)
	.filter(f => f.startsWith('full-error-analysis-'))
	.sort()
	.reverse()[0];

if (!latestReport) {
	console.error('❌ No error report found');
	process.exit(1);
}

const reportPath = path.join(reportsDir, latestReport);
console.log(`📄 Reading: ${latestReport}\n`);

const content = fs.readFileSync(reportPath, 'utf-8');
const lines = content.split('\n');

// Parse errors
const errors = [];
let currentError = null;

for (const line of lines) {
	// Match file path with error indicator
	// Format: path\to\file.svelte:line:col
	const fileMatch = line.match(/^(.+?\.(svelte|ts|js)):(\d+):(\d+)\s*$/);

	if (fileMatch) {
		if (currentError) {
			errors.push(currentError);
		}
		currentError = {
			file: fileMatch[1],
			line: parseInt(fileMatch[3]),
			col: parseInt(fileMatch[4]),
			message: '',
			code: null
		};
	} else if (currentError && line.trim().startsWith('Error:')) {
		// Extract error message and code
		currentError.message = line.replace(/^Error:\s*/, '').trim();

		// Extract TS code if present (e.g., "TS2322")
		const codeMatch = currentError.message.match(/\(ts(\d+)\)$/);
		if (codeMatch) {
			currentError.code = `TS${codeMatch[1]}`;
		} else {
			// Try to infer from message
			const tsMatch = currentError.message.match(/TS(\d+)/);
			if (tsMatch) {
				currentError.code = `TS${tsMatch[1]}`;
			}
		}
	} else if (currentError && line.trim() && !line.startsWith('Error:')) {
		// Continuation of error context
		if (!currentError.context) {
			currentError.context = [];
		}
		currentError.context.push(line.trim());
	}
}

if (currentError) {
	errors.push(currentError);
}

console.log(`✅ Parsed ${errors.length} errors\n`);

// Analyze error codes
const errorCodeCounts = {};
const unknownCodeErrors = [];

errors.forEach(err => {
	if (err.code) {
		errorCodeCounts[err.code] = (errorCodeCounts[err.code] || 0) + 1;
	} else {
		unknownCodeErrors.push(err);
	}
});

const topErrors = Object.entries(errorCodeCounts)
	.sort(([, a], [, b]) => b - a)
	.slice(0, 25);

console.log('📊 Top 25 Error Codes:\n');
console.log('  Count  Code     Sample Message');
console.log('  ──────────────────────────────────────────────────────────────────');

topErrors.forEach(([code, count]) => {
	const sample = errors.find(e => e.code === code);
	const msg = sample ? sample.message.slice(0, 55) : '';
	console.log(`  ${count.toString().padStart(5)}  ${code.padEnd(8)} ${msg}...`);
});

if (unknownCodeErrors.length > 0) {
	console.log(`\n  ${unknownCodeErrors.length} errors without TS code (possibly Svelte-specific)\n`);
}

// Analyze files with most errors
const fileCounts = {};
errors.forEach(err => {
	const shortFile = err.file.replace(/^.*\\sveltekit-frontend\\/, '');
	fileCounts[shortFile] = (fileCounts[shortFile] || 0) + 1;
});

const topFiles = Object.entries(fileCounts)
	.sort(([, a], [, b]) => b - a)
	.slice(0, 20);

console.log('\n📁 Top 20 Files with Most Errors:\n');
console.log('  Count  File');
console.log('  ──────────────────────────────────────────────────────────────────');

topFiles.forEach(([file, count]) => {
	const shortFile = file.length > 70 ? '...' + file.slice(-67) : file;
	console.log(`  ${count.toString().padStart(5)}  ${shortFile}`);
});

// Categorize by error type
const errorPatterns = {
	'Module/Import Issues': /Module .* has no exported member|Cannot find module/i,
	'Type Assignment': /Type .* is not assignable to type|Type .* does not satisfy/i,
	'Property Access': /Property .* does not exist|may only specify known properties/i,
	'Null/Undefined Safety': /possibly (null|undefined)|Object is possibly/i,
	'Function Signatures': /No overload matches|Expected .* arguments/i,
	'Svelte Component Props': /onclose|onclick|Props/i,
	'Generic/Template': /Type argument list|has no signatures|does not satisfy the constraint/i
};

const patternCounts = {};
errors.forEach(err => {
	let categorized = false;
	for (const [category, pattern] of Object.entries(errorPatterns)) {
		if (pattern.test(err.message)) {
			patternCounts[category] = (patternCounts[category] || 0) + 1;
			categorized = true;
			break;
		}
	}
	if (!categorized) {
		patternCounts['Other'] = (patternCounts['Other'] || 0) + 1;
	}
});

console.log('\n\n🏷️  Error Categories by Pattern:\n');
console.log('  Count  Category');
console.log('  ──────────────────────────────────────────────────────────────────');

Object.entries(patternCounts)
	.sort(([, a], [, b]) => b - a)
	.forEach(([category, count]) => {
		console.log(`  ${count.toString().padStart(5)}  ${category}`);
	});

// Generate actionable fix strategy
console.log('\n\n🎯 ACTIONABLE FIX STRATEGY:\n');

const strategy = [];

// Strategy 1: Module/Import fixes
const moduleErrors = errors.filter(e => /Module .* has no exported member/.test(e.message));
if (moduleErrors.length > 0) {
	const affectedModules = [...new Set(moduleErrors.map(e => {
		const match = e.message.match(/Module ["']([^"']+)["']/);
		return match ? match[1] : null;
	}).filter(Boolean))];

	strategy.push({
		priority: 'HIGH',
		category: 'Module/Import Fixes',
		count: moduleErrors.length,
		files: affectedModules.length,
		action: `Fix ${affectedModules.length} modules with missing exports`,
		details: affectedModules.slice(0, 5).join(', ') + (affectedModules.length > 5 ? '...' : '')
	});
}

// Strategy 2: Property access fixes
const propErrors = errors.filter(e => /Property .* does not exist|may only specify known properties/.test(e.message));
if (propErrors.length > 0) {
	strategy.push({
		priority: 'HIGH',
		category: 'Property Access Issues',
		count: propErrors.length,
		files: [...new Set(propErrors.map(e => e.file))].length,
		action: 'Fix component props and object property access',
		details: 'Update type definitions, add missing properties'
	});
}

// Strategy 3: Null/undefined safety
const nullErrors = errors.filter(e => /possibly (null|undefined)|Object is possibly/.test(e.message));
if (nullErrors.length > 0) {
	strategy.push({
		priority: 'MEDIUM',
		category: 'Null/Undefined Safety',
		count: nullErrors.length,
		files: [...new Set(nullErrors.map(e => e.file))].length,
		action: 'Add null checks and optional chaining',
		details: 'Use ?., ??, non-null assertions (!)'
	});
}

// Strategy 4: Type assignments
const typeErrors = errors.filter(e => /Type .* is not assignable/.test(e.message));
if (typeErrors.length > 0) {
	strategy.push({
		priority: 'MEDIUM',
		category: 'Type Assignment Mismatches',
		count: typeErrors.length,
		files: [...new Set(typeErrors.map(e => e.file))].length,
		action: 'Fix type mismatches and update interfaces',
		details: 'Review and update type definitions'
	});
}

strategy.forEach((item, index) => {
	console.log(`${index + 1}. [${item.priority}] ${item.category}`);
	console.log(`   Errors: ${item.count} across ${item.files} files`);
	console.log(`   Action: ${item.action}`);
	console.log(`   ${item.details}\n`);
});

// Save detailed analysis
const analysis = {
	timestamp: new Date().toISOString(),
	totalErrors: errors.length,
	errorCodeCounts,
	topErrors: topErrors.map(([code, count]) => ({ code, count })),
	topFiles: topFiles.map(([file, count]) => ({ file, count })),
	patternCounts,
	strategy,
	sampleErrors: errors.slice(0, 10).map(e => ({
		file: e.file,
		line: e.line,
		code: e.code,
		message: e.message
	}))
};

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const analysisPath = path.join(reportsDir, `parsed-error-analysis-${timestamp}.json`);
fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));

console.log(`✅ Detailed analysis saved: ${analysisPath}`);

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  📝 READY FOR AUTOMATED FIXES                               ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('Next: Create fix scripts for top error categories\n');
