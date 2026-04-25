#!/usr/bin/env node
/**
 * Phase 100: AST Analysis & Error Pattern Detection
 * Generates comprehensive reports for ACE Contextual Error Fixing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Parse tsc output
function parseTscErrors(tscOutputPath) {
	const content = fs.readFileSync(tscOutputPath, 'utf8');
	const lines = content.split('\n');

	const errors = [];
	// Match: file.ts(line,col): error TSxxxx: message
	const errorPattern = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+?)$/;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const match = trimmed.match(errorPattern);
		if (match) {
			errors.push({
				file: match[1].trim(),
				line: parseInt(match[2]),
				column: parseInt(match[3]),
				code: match[4],
				message: match[5].trim()
			});
		}
	}

	return errors;
}// Aggregate errors by file
function aggregateByFile(errors) {
	const byFile = {};

	for (const error of errors) {
		if (!byFile[error.file]) {
			byFile[error.file] = {
				path: error.file,
				errorCount: 0,
				errors: []
			};
		}

		byFile[error.file].errorCount++;
		byFile[error.file].errors.push(error);
	}

	return Object.values(byFile).sort((a, b) => b.errorCount - a.errorCount);
}

// Aggregate errors by type
function aggregateByErrorCode(errors) {
	const byCode = {};

	for (const error of errors) {
		if (!byCode[error.code]) {
			byCode[error.code] = {
				code: error.code,
				count: 0,
				sample: error.message,
				files: new Set()
			};
		}

		byCode[error.code].count++;
		byCode[error.code].files.add(error.file);
	}

	return Object.values(byCode)
		.map(item => ({ ...item, fileCount: item.files.size, files: undefined }))
		.sort((a, b) => b.count - a.count);
}

// Detect common patterns
function detectPatterns(errors) {
	const patterns = {
		missingImports: { count: 0, files: new Set(), sample: [] },
		typeAnnotations: { count: 0, files: new Set(), sample: [] },
		syntaxErrors: { count: 0, files: new Set(), sample: [] },
		moduleResolution: { count: 0, files: new Set(), sample: [] },
		genericErrors: { count: 0, files: new Set(), sample: [] },
		propertyErrors: { count: 0, files: new Set(), sample: [] },
		parameterErrors: { count: 0, files: new Set(), sample: [] }
	};

	for (const error of errors) {
		const msg = error.message.toLowerCase();

		if (msg.includes('cannot find name') || msg.includes('cannot find module')) {
			patterns.missingImports.count++;
			patterns.missingImports.files.add(error.file);
			if (patterns.missingImports.sample.length < 5) {
				patterns.missingImports.sample.push({ file: error.file, message: error.message });
			}
		} else if (msg.includes('type annotation') || msg.includes('implicitly has') || msg.includes('any type')) {
			patterns.typeAnnotations.count++;
			patterns.typeAnnotations.files.add(error.file);
			if (patterns.typeAnnotations.sample.length < 5) {
				patterns.typeAnnotations.sample.push({ file: error.file, message: error.message });
			}
		} else if (msg.includes('expected') && (msg.includes("','") || msg.includes("';'"))) {
			patterns.syntaxErrors.count++;
			patterns.syntaxErrors.files.add(error.file);
			if (patterns.syntaxErrors.sample.length < 5) {
				patterns.syntaxErrors.sample.push({ file: error.file, message: error.message });
			}
		} else if (msg.includes('module') || msg.includes('resolution')) {
			patterns.moduleResolution.count++;
			patterns.moduleResolution.files.add(error.file);
			if (patterns.moduleResolution.sample.length < 5) {
				patterns.moduleResolution.sample.push({ file: error.file, message: error.message });
			}
		} else if (msg.includes('generic') || msg.includes('type parameter')) {
			patterns.genericErrors.count++;
			patterns.genericErrors.files.add(error.file);
			if (patterns.genericErrors.sample.length < 5) {
				patterns.genericErrors.sample.push({ file: error.file, message: error.message });
			}
		} else if (msg.includes('property') || msg.includes('does not exist')) {
			patterns.propertyErrors.count++;
			patterns.propertyErrors.files.add(error.file);
			if (patterns.propertyErrors.sample.length < 5) {
				patterns.propertyErrors.sample.push({ file: error.file, message: error.message });
			}
		} else if (msg.includes('parameter')) {
			patterns.parameterErrors.count++;
			patterns.parameterErrors.files.add(error.file);
			if (patterns.parameterErrors.sample.length < 5) {
				patterns.parameterErrors.sample.push({ file: error.file, message: error.message });
			}
		}
	}

	// Convert Sets to counts
	return Object.entries(patterns).map(([name, data]) => ({
		pattern: name,
		errorCount: data.count,
		fileCount: data.files.size,
		sample: data.sample
	})).sort((a, b) => b.errorCount - a.errorCount);
}

// Generate markdown report
function generateReport(errors, byFile, byCode, patterns, top = 100) {
	const topFiles = byFile.slice(0, top);

	let report = `# Phase 100: ACE Contextual Error Fixing - AST Analysis Report
Generated: ${new Date().toISOString()}

## Executive Summary

- **Total Errors**: ${errors.length.toLocaleString()}
- **Files Affected**: ${byFile.length.toLocaleString()}
- **Unique Error Codes**: ${byCode.length}
- **Average Errors per File**: ${(errors.length / byFile.length).toFixed(2)}

---

## Top ${Math.min(top, byFile.length)} Files by Error Count

| Rank | File | Errors | Top Error Code |
|------|------|--------|----------------|
`;

	topFiles.forEach((file, idx) => {
		const topError = file.errors.reduce((acc, e) => {
			acc[e.code] = (acc[e.code] || 0) + 1;
			return acc;
		}, {});
		const mostCommon = Object.entries(topError).sort((a, b) => b[1] - a[1])[0];
		const relPath = path.relative(ROOT, file.path).replace(/\\/g, '/');

		report += `| ${idx + 1} | \`${relPath}\` | ${file.errorCount} | ${mostCommon[0]} (${mostCommon[1]}) |\n`;
	});

	report += `\n---

## Error Pattern Analysis

| Pattern | Errors | Files | Fixability |
|---------|--------|-------|------------|
`;

	patterns.forEach(p => {
		const fixability =
			p.pattern === 'missingImports' ? '🟢 AUTO (ts-morph)' :
			p.pattern === 'typeAnnotations' ? '🟡 SEMI-AUTO' :
			p.pattern === 'syntaxErrors' ? '🟢 AUTO (regex)' :
			p.pattern === 'moduleResolution' ? '🔴 MANUAL' :
			p.pattern === 'propertyErrors' ? '🟡 SEMI-AUTO' :
			'🟡 REVIEW';

		report += `| ${p.pattern} | ${p.errorCount.toLocaleString()} | ${p.fileCount} | ${fixability} |\n`;
	});

	report += `\n---

## Top Error Codes

| Code | Count | Files | Sample Message |
|------|-------|-------|----------------|
`;

	byCode.slice(0, 20).forEach(e => {
		const sample = e.sample.length > 80 ? e.sample.substring(0, 77) + '...' : e.sample;
		report += `| ${e.code} | ${e.count.toLocaleString()} | ${e.fileCount} | ${sample} |\n`;
	});

	report += `\n---

## Pattern Samples

`;

	patterns.slice(0, 5).forEach(p => {
		report += `### ${p.pattern} (${p.errorCount} errors)\n\n`;
		p.sample.forEach((s, idx) => {
			const relPath = path.relative(ROOT, s.file).replace(/\\/g, '/');
			report += `${idx + 1}. **${relPath}**\n   \`${s.message}\`\n\n`;
		});
	});

	report += `---

## Recommended Fix Strategy

### Phase 1: Automated Fixes (70-80% coverage)
1. **ts-morph Auto-Import** (Target: ${patterns.find(p => p.pattern === 'missingImports')?.errorCount || 0} errors)
   - Run on top 100 files
   - Use batch mode with --all flag

2. **Regex Syntax Fixes** (Target: ${patterns.find(p => p.pattern === 'syntaxErrors')?.errorCount || 0} errors)
   - Fix missing commas/semicolons
   - Fix malformed generics

3. **Type Annotation Inference** (Target: ${patterns.find(p => p.pattern === 'typeAnnotations')?.errorCount || 0} errors)
   - Add explicit types where inferrable
   - Fix 'any' type violations

### Phase 2: Semi-Automated (15-20% coverage)
1. **Property Access Fixes** (Target: ${patterns.find(p => p.pattern === 'propertyErrors')?.errorCount || 0} errors)
   - Guided by AST context
   - Manual review required

2. **Generic Type Fixes** (Target: ${patterns.find(p => p.pattern === 'genericErrors')?.errorCount || 0} errors)
   - Pattern-based with validation

### Phase 3: Manual Review (5-10% coverage)
1. **Module Resolution** (${patterns.find(p => p.pattern === 'moduleResolution')?.errorCount || 0} errors)
2. **Complex Type Mismatches**
3. **Architecture-level issues**

---

## Next Steps

\`\`\`bash
# 1. Dry-run on top 5 files
node scripts/phase100-dry-run.mjs --limit 5

# 2. Batch fix with ts-morph
node scripts/phase80-tsmorph-autoimport.mjs --all --limit 100

# 3. Run syntax fixer
node scripts/phase100-syntax-fixer.mjs --dry-run

# 4. Manual review
node scripts/phase100-manual-review.mjs --top 5
\`\`\`

---

*Generated by Phase 100: ACE Contextual Error Fixing Pipeline*
`;

	return report;
}

// Main execution
async function main() {
	const tscOutputPath = path.join(ROOT, 'reports', 'tsc-baseline-phase100.txt');

	if (!fs.existsSync(tscOutputPath)) {
		console.error('❌ Error: tsc baseline not found. Run tsc first.');
		process.exit(1);
	}

	console.log('📊 Phase 100: Analyzing TSC errors...\n');

	const errors = parseTscErrors(tscOutputPath);
	console.log(`✅ Parsed ${errors.length.toLocaleString()} errors`);

	const byFile = aggregateByFile(errors);
	console.log(`✅ Aggregated into ${byFile.length.toLocaleString()} files`);

	const byCode = aggregateByErrorCode(errors);
	console.log(`✅ Found ${byCode.length} unique error codes`);

	const patterns = detectPatterns(errors);
	console.log(`✅ Detected ${patterns.length} error patterns`);

	const report = generateReport(errors, byFile, byCode, patterns, 100);

	const reportPath = path.join(ROOT, 'reports', 'PHASE100_ACE_CONTEXTUAL_ERROR_FIXING.md');
	fs.writeFileSync(reportPath, report, 'utf8');

	console.log(`\n✅ Report saved: ${reportPath}`);

	// Save JSON data for other scripts
	const dataPath = path.join(ROOT, 'reports', 'phase100-error-data.json');
	fs.writeFileSync(dataPath, JSON.stringify({
		summary: {
			totalErrors: errors.length,
			filesAffected: byFile.length,
			errorCodes: byCode.length
		},
		topFiles: byFile.slice(0, 100),
		errorCodes: byCode,
		patterns
	}, null, 2), 'utf8');

	console.log(`✅ Data saved: ${dataPath}\n`);

	// Print top 10 files
	console.log('📁 Top 10 Files:\n');
	byFile.slice(0, 10).forEach((f, idx) => {
		const relPath = path.relative(ROOT, f.path).replace(/\\/g, '/');
		console.log(`${idx + 1}. ${relPath} (${f.errorCount} errors)`);
	});

	console.log('\n📊 Top 5 Patterns:\n');
	patterns.slice(0, 5).forEach((p, idx) => {
		console.log(`${idx + 1}. ${p.pattern}: ${p.errorCount} errors in ${p.fileCount} files`);
	});
}

main().catch(console.error);
