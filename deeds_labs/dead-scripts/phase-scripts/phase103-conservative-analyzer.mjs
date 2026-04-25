#!/usr/bin/env node
import fs from 'fs';

console.log('🔍 Phase 103: Conservative Error Analysis\n');

const tscOutput = fs.readFileSync('reports/tsc-errors-phase103.txt', 'utf8');
const lines = tscOutput.split('\n');

const errorsByFile = new Map();
const errorsByCode = new Map();
const sourceFileErrors = [];

for (const line of lines) {
	const match = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
	if (!match) continue;

	const [, file, lineNum, col, code, message] = match;

	// Skip generated .svelte-kit files
	if (file.includes('.svelte-kit/types')) continue;

	// Track source file errors
	sourceFileErrors.push({ file, lineNum: parseInt(lineNum), col: parseInt(col), code, message });

	if (!errorsByFile.has(file)) {
		errorsByFile.set(file, []);
	}
	errorsByFile.get(file).push({ lineNum: parseInt(lineNum), col: parseInt(col), code, message });

	if (!errorsByCode.has(code)) {
		errorsByCode.set(code, { count: 0, files: new Set(), examples: [] });
	}
	const codeData = errorsByCode.get(code);
	codeData.count++;
	codeData.files.add(file);
	if (codeData.examples.length < 3) {
		codeData.examples.push({ file, lineNum, message });
	}
}

const sortedFiles = [...errorsByFile.entries()].sort((a, b) => b[1].length - a[1].length);
const sortedCodes = [...errorsByCode.entries()].sort((a, b) => b[1].count - a[1].count);

console.log(`✅ Found ${sourceFileErrors.length.toLocaleString()} errors in source files`);
console.log(`📁 ${errorsByFile.size} files affected`);
console.log(`🎯 ${errorsByCode.size} unique error codes\n`);

// Generate comprehensive report
let report = `# Phase 103: Conservative Error Analysis (Source Files Only)\n\n`;
report += `**Date:** ${new Date().toISOString()}\n`;
report += `**Total Source Errors:** ${sourceFileErrors.length.toLocaleString()}\n`;
report += `**Affected Files:** ${errorsByFile.size}\n`;
report += `**Unique Error Codes:** ${errorsByCode.size}\n\n`;

report += `## Top 15 Error Codes\n\n`;
report += `| # | Code | Count | Files | Message |\n`;
report += `|---|------|-------|-------|----------|\n`;

sortedCodes.slice(0, 15).forEach(([code, data], i) => {
	const pct = ((data.count / sourceFileErrors.length) * 100).toFixed(1);
	const msg = data.examples[0]?.message.slice(0, 50) || '';
	report += `| ${i + 1} | ${code} | ${data.count} (${pct}%) | ${data.files.size} | ${msg}... |\n`;
});

report += `\n## Top 30 Most Broken Files\n\n`;
report += `| # | Errors | File |\n`;
report += `|---|--------|------|\n`;

sortedFiles.slice(0, 30).forEach(([file, errors], i) => {
	const shortFile = file.replace(/^src\//, '');
	const topError = errors[0];
	report += `| ${i + 1} | ${errors.length} | \`${shortFile}\` (${topError.code}) |\n`;
});

report += `\n## Fixable Patterns (Conservative)\n\n`;

// Identify safe, automatable fixes
const fixablePatterns = [];

sortedCodes.forEach(([code, data]) => {
	let pattern = null;

	switch (code) {
		case 'TS1005':
			if (data.examples[0]?.message.includes("',' expected")) {
				pattern = {
					code,
					name: 'missing_comma',
					confidence: 'HIGH',
					description: 'Missing comma in object/array literal',
					count: data.count,
					strategy: 'Add comma before closing brace/bracket'
				};
			} else if (data.examples[0]?.message.includes("';' expected")) {
				pattern = {
					code,
					name: 'missing_semicolon',
					confidence: 'MEDIUM',
					description: 'Missing semicolon after statement',
					count: data.count,
					strategy: 'Add semicolon at end of line'
				};
			}
			break;

		case 'TS2304':
			pattern = {
				code,
				name: 'cannot_find_name',
				confidence: 'LOW',
				description: 'Variable/type not found - needs import',
				count: data.count,
				strategy: 'MANUAL: Add missing import or fix typo'
			};
			break;

		case 'TS2552':
			pattern = {
				code,
				name: 'cannot_find_name_suggestion',
				confidence: 'MEDIUM',
				description: 'Variable not found with suggestion',
				count: data.count,
				strategy: 'Extract suggestion from error message and apply'
			};
			break;
	}

	if (pattern) {
		fixablePatterns.push(pattern);
	}
});

report += `| Pattern | Code | Confidence | Count | Strategy |\n`;
report += `|---------|------|------------|-------|----------|\n`;

fixablePatterns.forEach(p => {
	const emoji = p.confidence === 'HIGH' ? '✅' : p.confidence === 'MEDIUM' ? '⚠️' : '❌';
	report += `| ${emoji} ${p.name} | ${p.code} | ${p.confidence} | ${p.count} | ${p.strategy} |\n`;
});

report += `\n## Detailed Examples\n\n`;

sortedCodes.slice(0, 5).forEach(([code, data], i) => {
	report += `### ${i + 1}. ${code} (${data.count} errors across ${data.files.size} files)\n\n`;
	report += `**Examples:**\n`;
	data.examples.forEach(ex => {
		report += `- \`${ex.file}:${ex.lineNum}\`\n`;
		report += `  ${ex.message}\n`;
	});
	report += `\n`;
});

fs.writeFileSync('reports/PHASE103_CONSERVATIVE_ANALYSIS.md', report);
console.log('✅ Report: reports/PHASE103_CONSERVATIVE_ANALYSIS.md');

// Generate JSON for surgical fixes
const fixData = {
	timestamp: new Date().toISOString(),
	stats: {
		totalErrors: sourceFileErrors.length,
		affectedFiles: errorsByFile.size,
		uniqueCodes: errorsByCode.size
	},
	topFiles: sortedFiles.slice(0, 50).map(([file, errors]) => ({
		file,
		errorCount: errors.length,
		errors: errors.slice(0, 10) // First 10 per file
	})),
	fixablePatterns: fixablePatterns.filter(p => p.confidence !== 'LOW'),
	errorsByCode: sortedCodes.slice(0, 20).map(([code, data]) => ({
		code,
		count: data.count,
		fileCount: data.files.size,
		examples: data.examples
	}))
};

fs.writeFileSync('reports/phase103-fix-data.json', JSON.stringify(fixData, null, 2));
console.log('✅ Data: reports/phase103-fix-data.json');

console.log(`\n📊 Summary:`);
console.log(`   Total errors: ${sourceFileErrors.length.toLocaleString()}`);
console.log(`   Top pattern: ${sortedCodes[0][0]} (${sortedCodes[0][1].count} occurrences)`);
console.log(`   Worst file: ${sortedFiles[0][0].replace(/^src\//, '')} (${sortedFiles[0][1].length} errors)`);
