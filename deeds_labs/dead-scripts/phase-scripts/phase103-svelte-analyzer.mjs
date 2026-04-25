#!/usr/bin/env node
import fs from 'fs';

console.log('🔍 Phase 103: Svelte-Check Error Analysis\n');

const output = fs.readFileSync('reports/svelte-check-phase103.txt', 'utf8');
const lines = output.split('\n');

const errorsByFile = new Map();
const errorsByCode = new Map();
const errorsByMessage = new Map();

let totalErrors = 0;

for (const line of lines) {
	// Machine format: timestamp ERROR "filename" line:col "message"
	const match = line.match(/^\d+\s+ERROR\s+"([^"]+)"\s+(\d+):(\d+)\s+"([^"]+)"$/);
	if (!match) continue;

	let [, file, lineNum, col, message] = match;

	// Normalize Windows paths
	file = file.replace(/\\\\/g, '/').replace(/\\/g, '/');

	// Extract code from message or categorize by message type
	let code = 'unknown';
	if (message.includes("',' expected")) code = 'ts(1005)';
	else if (message.includes("';' expected")) code = 'ts(1005)';
	else if (message.includes("Cannot find name")) code = 'ts(2304)';
	else if (message.includes("only refers to a type")) code = 'ts(2749)';
	else if (message.includes("not assignable")) code = 'ts(2322)';
	else if (message.includes("Unexpected keyword")) code = 'ts(1434)';
	else if (message.includes("Declaration or statement expected")) code = 'ts(1128)';
	else code = message.slice(0, 30); // Use message prefix as code

	totalErrors++;

	// Track by file
	if (!errorsByFile.has(file)) {
		errorsByFile.set(file, []);
	}
	errorsByFile.get(file).push({
		line: parseInt(lineNum),
		col: parseInt(col),
		message,
		code
	});

	// Track by code
	if (!errorsByCode.has(code)) {
		errorsByCode.set(code, { count: 0, files: new Set(), examples: [] });
	}
	const codeData = errorsByCode.get(code);
	codeData.count++;
	codeData.files.add(file);
	if (codeData.examples.length < 5) {
		codeData.examples.push({ file, line: lineNum, message: message.slice(0, 100) });
	}

	// Track by message pattern
	const msgKey = message.slice(0, 80);
	if (!errorsByMessage.has(msgKey)) {
		errorsByMessage.set(msgKey, 0);
	}
	errorsByMessage.set(msgKey, errorsByMessage.get(msgKey) + 1);
}

const sortedFiles = [...errorsByFile.entries()].sort((a, b) => b[1].length - a[1].length);
const sortedCodes = [...errorsByCode.entries()].sort((a, b) => b[1].count - a[1].count);
const sortedMessages = [...errorsByMessage.entries()].sort((a, b) => b[1] - a[1]);

console.log(`✅ Parsed ${totalErrors.toLocaleString()} errors`);
console.log(`📁 ${errorsByFile.size} files affected`);
console.log(`🎯 ${errorsByCode.size} unique error codes\n`);

// Generate report
let report = `# Phase 103: Svelte-Check Error Analysis\n\n`;
report += `**Timestamp:** ${new Date().toISOString()}\n`;
report += `**Total Errors:** ${totalErrors.toLocaleString()}\n`;
report += `**Affected Files:** ${errorsByFile.size}\n`;
report += `**Unique Error Codes:** ${errorsByCode.size}\n\n`;

report += `## Top 20 Error Codes\n\n`;
report += `| # | Code | Count | % | Files | Example |\n`;
report += `|---|------|-------|---|-------|----------|\n`;

sortedCodes.slice(0, 20).forEach(([code, data], i) => {
	const pct = ((data.count / totalErrors) * 100).toFixed(1);
	const example = data.examples[0]?.message.slice(0, 40) || '';
	report += `| ${i + 1} | ${code} | ${data.count.toLocaleString()} | ${pct}% | ${data.files.size} | ${example}... |\n`;
});

report += `\n## Top 30 Most Broken Files\n\n`;
report += `| # | Errors | File | Top Error |\n`;
report += `|---|--------|------|------------|\n`;

sortedFiles.slice(0, 30).forEach(([file, errors], i) => {
	const shortFile = file.replace(/^src\//, '').slice(0, 60);
	const topError = errors[0];
	report += `| ${i + 1} | ${errors.length} | \`${shortFile}\` | ${topError.code} |\n`;
});

report += `\n## Top 20 Error Message Patterns\n\n`;
report += `| # | Count | % | Message Pattern |\n`;
report += `|---|-------|---|------------------|\n`;

sortedMessages.slice(0, 20).forEach(([msg, count], i) => {
	const pct = ((count / totalErrors) * 100).toFixed(1);
	report += `| ${i + 1} | ${count.toLocaleString()} | ${pct}% | ${msg}... |\n`;
});

report += `\n## Detailed Code Analysis\n\n`;

sortedCodes.slice(0, 10).forEach(([code, data], i) => {
	report += `### ${i + 1}. ${code} - ${data.count.toLocaleString()} errors (${((data.count / totalErrors) * 100).toFixed(1)}%)\n\n`;
	report += `**Affected Files:** ${data.files.size}\n\n`;
	report += `**Examples:**\n`;
	data.examples.forEach(ex => {
		const shortFile = ex.file.replace(/^src\//, '');
		report += `- \`${shortFile}:${ex.line}\` - ${ex.message}\n`;
	});
	report += `\n`;
});

report += `\n## Actionable Fix Strategy\n\n`;

// Analyze fixability
const fixablePatterns = [];

sortedCodes.forEach(([code, data]) => {
	const example = data.examples[0]?.message || '';

	let strategy = {
		code,
		count: data.count,
		confidence: 'LOW',
		action: 'MANUAL',
		description: ''
	};

	// TypeScript-specific patterns
	if (code === 'ts(2304)') {
		strategy.confidence = 'MEDIUM';
		strategy.action = 'Add missing import or fix variable name';
		strategy.description = 'Cannot find name - likely missing import';
	} else if (code === 'ts(2552)') {
		strategy.confidence = 'HIGH';
		strategy.action = 'Apply suggested fix from error message';
		strategy.description = 'TypeScript provides suggestion - can automate';
	} else if (code === 'ts(1005)') {
		if (example.includes("',' expected")) {
			strategy.confidence = 'MEDIUM';
			strategy.action = 'Add missing comma';
			strategy.description = 'Syntax error - missing comma';
		} else if (example.includes("';' expected")) {
			strategy.confidence = 'MEDIUM';
			strategy.action = 'Add missing semicolon';
			strategy.description = 'Syntax error - missing semicolon';
		}
	} else if (code === 'ts(2322)') {
		strategy.confidence = 'LOW';
		strategy.action = 'Fix type mismatch';
		strategy.description = 'Type incompatibility - needs manual review';
	}

	if (strategy.confidence !== 'LOW' || data.count > 100) {
		fixablePatterns.push(strategy);
	}
});

report += `| Code | Count | Confidence | Action |\n`;
report += `|------|-------|------------|--------|\n`;

fixablePatterns.slice(0, 15).forEach(p => {
	const emoji = p.confidence === 'HIGH' ? '✅' : p.confidence === 'MEDIUM' ? '⚠️' : '❌';
	report += `| ${p.code} | ${p.count.toLocaleString()} | ${emoji} ${p.confidence} | ${p.action} |\n`;
});

fs.writeFileSync('reports/PHASE103_SVELTE_CHECK_ANALYSIS.md', report);
console.log('✅ Report: reports/PHASE103_SVELTE_CHECK_ANALYSIS.md');

// Export JSON for automation
const jsonData = {
	timestamp: new Date().toISOString(),
	stats: {
		totalErrors,
		affectedFiles: errorsByFile.size,
		uniqueCodes: errorsByCode.size
	},
	topCodes: sortedCodes.slice(0, 30).map(([code, data]) => ({
		code,
		count: data.count,
		fileCount: data.files.size,
		examples: data.examples.slice(0, 3)
	})),
	topFiles: sortedFiles.slice(0, 50).map(([file, errors]) => ({
		file,
		errorCount: errors.length,
		topErrors: errors.slice(0, 5)
	})),
	fixablePatterns: fixablePatterns.filter(p => p.confidence !== 'LOW')
};

fs.writeFileSync('reports/phase103-svelte-check-data.json', JSON.stringify(jsonData, null, 2));
console.log('✅ Data: reports/phase103-svelte-check-data.json\n');

console.log(`📊 Summary:`);
console.log(`   Total errors: ${totalErrors.toLocaleString()}`);
if (sortedCodes.length > 0) {
	console.log(`   Top code: ${sortedCodes[0][0]} (${sortedCodes[0][1].count.toLocaleString()} occurrences, ${sortedCodes[0][1].files.size} files)`);
}
if (sortedFiles.length > 0) {
	const worstFile = sortedFiles[0][0].replace(/^src\//, '');
	console.log(`   Worst file: ${worstFile} (${sortedFiles[0][1].length} errors)`);
}
