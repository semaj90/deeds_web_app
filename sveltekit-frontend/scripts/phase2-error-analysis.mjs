#!/usr/bin/env node
/**
 * Phase 2: Comprehensive Error Analysis & Strategy
 * Analyzes the remaining 5,032 project errors and creates fix strategy
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  📊 PROJECT ERROR ANALYSIS - PHASE 2                        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Run svelte-check and capture output
console.log('🔍 Running svelte-check to gather error data...\n');

let errorOutput;
try {
	errorOutput = execSync('npx svelte-check --threshold error --tsconfig ./tsconfig.json', {
		encoding: 'utf-8',
		maxBuffer: 50 * 1024 * 1024, // 50MB buffer
		cwd: process.cwd()
	});
} catch (error) {
	errorOutput = error.stdout + error.stderr;
}

// Save full output
const reportsDir = path.join(process.cwd(), 'reports');
if (!fs.existsSync(reportsDir)) {
	fs.mkdirSync(reportsDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const fullReportPath = path.join(reportsDir, `full-error-analysis-${timestamp}.txt`);
fs.writeFileSync(fullReportPath, errorOutput);

console.log(`✅ Full report saved: ${fullReportPath}\n`);

// Parse errors
const errorLines = errorOutput.split('\n');
const errors = [];
const errorCodePattern = /TS(\d+):/;
const filePattern = /^(.+?\.(?:svelte|ts|js))\s*$/;

let currentFile = null;
for (const line of errorLines) {
	const fileMatch = line.match(filePattern);
	if (fileMatch) {
		currentFile = fileMatch[1];
	}

	const codeMatch = line.match(errorCodePattern);
	if (codeMatch && currentFile) {
		const errorCode = `TS${codeMatch[1]}`;
		errors.push({
			file: currentFile,
			code: errorCode,
			line: line
		});
	}
}

console.log(`📈 Parsed ${errors.length} errors\n`);

// Analyze error codes
const errorCodeCounts = {};
errors.forEach(err => {
	errorCodeCounts[err.code] = (errorCodeCounts[err.code] || 0) + 1;
});

const topErrors = Object.entries(errorCodeCounts)
	.sort(([, a], [, b]) => b - a)
	.slice(0, 20);

console.log('📊 Top 20 Error Codes:\n');
console.log('  Count  Code     Description');
console.log('  ─────────────────────────────────────────────────────────');

const errorDescriptions = {
	'TS2322': 'Type is not assignable',
	'TS2345': 'Argument type mismatch',
	'TS2339': 'Property does not exist',
	'TS2532': 'Object is possibly undefined',
	'TS2304': 'Cannot find name',
	'TS2769': 'No overload matches this call',
	'TS2307': 'Cannot find module',
	'TS2571': 'Object is of type unknown',
	'TS2740': 'Type is missing properties',
	'TS2341': 'Private property access',
	'TS7006': 'Parameter implicitly has any type',
	'TS18046': 'Value is possibly null/undefined',
	'TS2531': 'Object is possibly null',
	'TS2352': 'Conversion type mismatch',
	'TS2344': 'Type does not satisfy constraint'
};

topErrors.forEach(([code, count]) => {
	const desc = errorDescriptions[code] || 'Unknown error';
	console.log(`  ${count.toString().padStart(5)}  ${code.padEnd(8)} ${desc}`);
});

// Analyze files with most errors
const fileCounts = {};
errors.forEach(err => {
	fileCounts[err.file] = (fileCounts[err.file] || 0) + 1;
});

const topFiles = Object.entries(fileCounts)
	.sort(([, a], [, b]) => b - a)
	.slice(0, 15);

console.log('\n\n📁 Top 15 Files with Most Errors:\n');
console.log('  Count  File');
console.log('  ─────────────────────────────────────────────────────────');

topFiles.forEach(([file, count]) => {
	const shortFile = file.length > 60 ? '...' + file.slice(-57) : file;
	console.log(`  ${count.toString().padStart(5)}  ${shortFile}`);
});

// Categorize errors by type
const categories = {
	'Svelte 5 Migration': ['TS2322', 'TS2345', 'TS2339'],
	'Type Safety': ['TS2532', 'TS2531', 'TS18046', 'TS2571'],
	'Module/Import': ['TS2307', 'TS2304'],
	'Function Signatures': ['TS2769', 'TS7006', 'TS2344'],
	'Property Access': ['TS2341', 'TS2740', 'TS2352']
};

const categoryCounts = {};
Object.entries(categories).forEach(([category, codes]) => {
	categoryCounts[category] = codes.reduce((sum, code) =>
		sum + (errorCodeCounts[code] || 0), 0);
});

console.log('\n\n🏷️  Error Categories:\n');
console.log('  Count  Category');
console.log('  ─────────────────────────────────────────────────────────');

Object.entries(categoryCounts)
	.sort(([, a], [, b]) => b - a)
	.forEach(([category, count]) => {
		if (count > 0) {
			console.log(`  ${count.toString().padStart(5)}  ${category}`);
		}
	});

// Generate fix strategy
console.log('\n\n🎯 RECOMMENDED FIX STRATEGY:\n');

const strategy = [
	{
		priority: 'HIGH',
		category: 'Type Safety (null/undefined)',
		codes: ['TS2532', 'TS2531', 'TS18046'],
		count: (errorCodeCounts['TS2532'] || 0) + (errorCodeCounts['TS2531'] || 0) + (errorCodeCounts['TS18046'] || 0),
		approach: 'Add null checks, optional chaining (?.), nullish coalescing (??)',
		automation: 'Highly automatable with AST transforms'
	},
	{
		priority: 'HIGH',
		category: 'Svelte 5 Migration',
		codes: ['TS2322', 'TS2345'],
		count: (errorCodeCounts['TS2322'] || 0) + (errorCodeCounts['TS2345'] || 0),
		approach: 'Update component props, event handlers, store subscriptions',
		automation: 'Partially automatable with pattern matching'
	},
	{
		priority: 'MEDIUM',
		category: 'Property Access',
		codes: ['TS2339', 'TS2740'],
		count: (errorCodeCounts['TS2339'] || 0) + (errorCodeCounts['TS2740'] || 0),
		approach: 'Fix type definitions, add missing properties',
		automation: 'Manual review required'
	},
	{
		priority: 'MEDIUM',
		category: 'Function Signatures',
		codes: ['TS2769', 'TS7006'],
		count: (errorCodeCounts['TS2769'] || 0) + (errorCodeCounts['TS7006'] || 0),
		approach: 'Update function parameters, add type annotations',
		automation: 'Partially automatable'
	},
	{
		priority: 'LOW',
		category: 'Module/Import Issues',
		codes: ['TS2307', 'TS2304'],
		count: (errorCodeCounts['TS2307'] || 0) + (errorCodeCounts['TS2304'] || 0),
		approach: 'Fix import paths, add missing dependencies',
		automation: 'Manual review required'
	}
];

strategy
	.sort((a, b) => b.count - a.count)
	.forEach((item, index) => {
		console.log(`${index + 1}. [${item.priority}] ${item.category} (${item.count} errors)`);
		console.log(`   Codes: ${item.codes.join(', ')}`);
		console.log(`   Approach: ${item.approach}`);
		console.log(`   Automation: ${item.automation}\n`);
	});

// Save analysis report
const analysisReport = {
	timestamp: new Date().toISOString(),
	totalErrors: errors.length,
	uniqueErrorCodes: Object.keys(errorCodeCounts).length,
	topErrors: topErrors.map(([code, count]) => ({ code, count, description: errorDescriptions[code] })),
	topFiles: topFiles.map(([file, count]) => ({ file, count })),
	categories: categoryCounts,
	strategy: strategy,
	fullReportPath: fullReportPath
};

const analysisPath = path.join(reportsDir, `error-analysis-${timestamp}.json`);
fs.writeFileSync(analysisPath, JSON.stringify(analysisReport, null, 2));

console.log(`\n✅ Analysis report saved: ${analysisPath}`);

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  📝 NEXT STEPS                                              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('1. Review top error files and identify patterns');
console.log('2. Create automated fix scripts for type safety errors');
console.log('3. Begin Svelte 5 migration for high-error components');
console.log('4. Address module/import issues systematically');
console.log('\n✨ Error analysis complete!\n');

// Return summary for programmatic use
export default analysisReport;
