#!/usr/bin/env node
import fs from 'fs';

const tscOutput = fs.readFileSync('reports/tsc-errors-phase103.txt', 'utf8');
const lines = tscOutput.split('\n');

const errorPatterns = new Map();
const fileErrors = new Map();

let currentFile = '';
let errorCount = 0;

for (const line of lines) {
	// Match error lines: src/file.ts(123,45): error TS1234: Message
	const match = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/);

	if (match) {
		const [, file, lineNum, col, code, message] = match;
		errorCount++;

		// Track by error code
		if (!errorPatterns.has(code)) {
			errorPatterns.set(code, { count: 0, message, examples: [] });
		}
		const pattern = errorPatterns.get(code);
		pattern.count++;
		if (pattern.examples.length < 5) {
			pattern.examples.push({ file, lineNum, col, message });
		}

		// Track by file
		if (!fileErrors.has(file)) {
			fileErrors.set(file, 0);
		}
		fileErrors.set(file, fileErrors.get(file) + 1);
	}
}

// Sort by frequency
const sortedPatterns = [...errorPatterns.entries()].sort((a, b) => b[1].count - a[1].count);
const sortedFiles = [...fileErrors.entries()].sort((a, b) => b[1] - a[1]);

// Generate report
let report = `# Phase 103: TSC Error Analysis\n\n`;
report += `**Total Errors:** ${errorCount.toLocaleString()}\n`;
report += `**Unique Error Codes:** ${errorPatterns.size}\n`;
report += `**Affected Files:** ${fileErrors.size}\n\n`;

report += `## Top 20 Error Patterns\n\n`;
report += `| Rank | Code | Count | % | Message |\n`;
report += `|------|------|-------|---|----------|\n`;

sortedPatterns.slice(0, 20).forEach(([code, data], i) => {
	const pct = ((data.count / errorCount) * 100).toFixed(1);
	report += `| ${i + 1} | ${code} | ${data.count.toLocaleString()} | ${pct}% | ${data.message.slice(0, 60)}... |\n`;
});

report += `\n## Top 20 Most Broken Files\n\n`;
report += `| Rank | Errors | File |\n`;
report += `|------|--------|------|\n`;

sortedFiles.slice(0, 20).forEach(([file, count], i) => {
	const shortFile = file.replace(/^src\//, '');
	report += `| ${i + 1} | ${count} | ${shortFile} |\n`;
});

report += `\n## Critical Pattern Details\n\n`;

// Show detailed examples for top 10 patterns
sortedPatterns.slice(0, 10).forEach(([code, data], i) => {
	report += `### ${i + 1}. ${code}: ${data.message}\n`;
	report += `**Count:** ${data.count.toLocaleString()} (${((data.count / errorCount) * 100).toFixed(1)}%)\n\n`;
	report += `**Examples:**\n`;
	data.examples.forEach(ex => {
		report += `- \`${ex.file}:${ex.lineNum}\` - ${ex.message.slice(0, 80)}\n`;
	});
	report += `\n`;
});

// Save report
fs.writeFileSync('reports/PHASE103_ERROR_ANALYSIS.md', report);
console.log('✅ Report saved to reports/PHASE103_ERROR_ANALYSIS.md');

// Generate JSON for automated fixing
const fixablePatterns = {
	totalErrors: errorCount,
	patterns: sortedPatterns.slice(0, 50).map(([code, data]) => ({
		code,
		count: data.count,
		message: data.message,
		examples: data.examples
	})),
	topFiles: sortedFiles.slice(0, 100).map(([file, count]) => ({ file, count }))
};

fs.writeFileSync('reports/phase103-fixable-patterns.json', JSON.stringify(fixablePatterns, null, 2));
console.log('✅ JSON saved to reports/phase103-fixable-patterns.json');
console.log(`\n📊 Total: ${errorCount.toLocaleString()} errors across ${fileErrors.size} files`);
console.log(`🎯 Top pattern: ${sortedPatterns[0][0]} (${sortedPatterns[0][1].count.toLocaleString()} occurrences)`);
