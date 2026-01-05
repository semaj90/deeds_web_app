#!/usr/bin/env node
/**
 * Phase 74: Error Analyzer - Parse svelte-check output and generate fix priorities
 *
 * Usage:
 *   node scripts/phase74-error-analyzer.mjs logs/errors-post-phase73.txt
 *
 * Features:
 *   - Parse error counts per file
 *   - Cluster by error type
 *   - Generate top 100 highest-error files
 *   - Suggest common fix patterns
 */

import fs from 'fs';
import path from 'path';

// Parse arguments
const errorLogPath = process.argv[2] || 'logs/errors-post-phase73.txt';

if (!fs.existsSync(errorLogPath)) {
    console.error(`❌ Error log not found: ${errorLogPath}`);
    console.error('Usage: node scripts/phase74-error-analyzer.mjs <path-to-error-log>');
    process.exit(1);
}

console.log(`📊 Analyzing errors from: ${errorLogPath}\n`);

const content = fs.readFileSync(errorLogPath, 'utf-8');
const lines = content.split('\n');

// Data structures
const fileErrors = new Map(); // file -> count
const errorTypes = new Map(); // error code -> count
const errorMessages = new Map(); // error message -> count
const fileErrorDetails = new Map(); // file -> array of {line, col, message, type}

// Parse patterns
//  /path/to/file.ts:123:45 - error TS2304: Cannot find name 'foo'.
const errorPattern = /^(.+?):(\d+):(\d+)\s*-\s*error\s+(TS\d+):\s*(.+)$/;

for (const line of lines) {
    const match = line.match(errorPattern);
    if (match) {
        const [, filePath, lineNum, colNum, errorCode, errorMsg] = match;

        // Normalize file path
        const normalizedPath = filePath.replace(/\\/g, '/');

        // Track file error count
        fileErrors.set(normalizedPath, (fileErrors.get(normalizedPath) || 0) + 1);

        // Track error type
        errorTypes.set(errorCode, (errorTypes.get(errorCode) || 0) + 1);

        // Track error message pattern
        const msgPattern = errorMsg.replace(/'[^']+'/g, "'X'").replace(/`[^`]+`/g, "`X`");
        errorMessages.set(msgPattern, (errorMessages.get(msgPattern) || 0) + 1);

        // Track details
        if (!fileErrorDetails.has(normalizedPath)) {
            fileErrorDetails.set(normalizedPath, []);
        }
        fileErrorDetails.get(normalizedPath).push({
            line: parseInt(lineNum),
            col: parseInt(colNum),
            message: errorMsg,
            type: errorCode
        });
    }
}

// Sort and analyze
const sortedFiles = Array.from(fileErrors.entries())
    .sort((a, b) => b[1] - a[1]);

const sortedTypes = Array.from(errorTypes.entries())
    .sort((a, b) => b[1] - a[1]);

const sortedMessages = Array.from(errorMessages.entries())
    .sort((a, b) => b[1] - a[1]);

// Output summary
console.log(`📈 Summary Statistics:`);
console.log(`   Total Files with Errors: ${fileErrors.size}`);
console.log(`   Total Error Count: ${Array.from(fileErrors.values()).reduce((sum, n) => sum + n, 0)}`);
console.log(`   Unique Error Types: ${errorTypes.size}`);
console.log(`\n`);

// Top 100 files
console.log(`📁 Top 100 Highest-Error Files:\n`);
const top100 = sortedFiles.slice(0, 100);
for (let i = 0; i < top100.length; i++) {
    const [file, count] = top100[i];
    const shortPath = file.replace(/^.*\/src\//, 'src/');
    console.log(`${(i + 1).toString().padStart(3)}. ${count.toString().padStart(4)} errors - ${shortPath}`);
}

// Top 20 error types
console.log(`\n\n🔍 Top 20 Error Types:\n`);
for (let i = 0; i < Math.min(20, sortedTypes.length); i++) {
    const [code, count] = sortedTypes[i];
    console.log(`${code.padEnd(8)} - ${count.toString().padStart(5)} occurrences`);
}

// Top 20 error messages
console.log(`\n\n💬 Top 20 Error Message Patterns:\n`);
for (let i = 0; i < Math.min(20, sortedMessages.length); i++) {
    const [msg, count] = sortedMessages[i];
    console.log(`${count.toString().padStart(5)}x - ${msg.substring(0, 100)}`);
}

// Write top 100 to file
const outputDir = 'logs';
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const top100Path = path.join(outputDir, 'top-100-error-files.txt');
const top100Content = top100.map(([file, count], i) => {
    const shortPath = file.replace(/^.*\/src\//, 'src/');
    return `${i + 1}. ${count} errors - ${shortPath}`;
}).join('\n');

fs.writeFileSync(top100Path, top100Content, 'utf-8');
console.log(`\n\n✅ Top 100 files written to: ${top100Path}`);

// Write detailed analysis
const analysisPath = path.join(outputDir, 'error-analysis-phase74.json');
const analysis = {
    summary: {
        totalFiles: fileErrors.size,
        totalErrors: Array.from(fileErrors.values()).reduce((sum, n) => sum + n, 0),
        uniqueErrorTypes: errorTypes.size
    },
    topFiles: top100.map(([file, count]) => ({ file, count })),
    errorTypes: Object.fromEntries(sortedTypes.slice(0, 50)),
    commonMessages: Object.fromEntries(sortedMessages.slice(0, 50))
};

fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2), 'utf-8');
console.log(`✅ Detailed analysis written to: ${analysisPath}`);

// Fix suggestions
console.log(`\n\n🔧 Suggested Fix Strategy:\n`);
console.log(`1. **Start with Top 5 Files** (likely 50%+ of total errors):`);
for (let i = 0; i < Math.min(5, top100.length); i++) {
    const [file] = top100[i];
    console.log(`   - ${file.replace(/^.*\/src\//, 'src/')}`);
}

console.log(`\n2. **Focus on High-Impact Error Types**:`);
const highImpact = ['TS2304', 'TS2322', 'TS2345', 'TS2339', 'TS7006'];
for (const code of highImpact) {
    const count = errorTypes.get(code);
    if (count) {
        const meaning = {
            'TS2304': 'Cannot find name (missing import)',
            'TS2322': 'Type X is not assignable to type Y',
            'TS2345': 'Argument type mismatch',
            'TS2339': 'Property does not exist on type',
            'TS7006': 'Implicit any parameter'
        };
        console.log(`   - ${code}: ${meaning[code]} (${count} occurrences)`);
    }
}

console.log(`\n3. **Automated Fix Patterns**:`);
console.log(`   - Add missing imports (TS2304)`);
console.log(`   - Add type assertions (TS2322, TS2345)`);
console.log(`   - Add optional chaining (TS2339)`);
console.log(`   - Add explicit types (TS7006)`);

console.log(`\n✨ Phase 74 Error Analysis Complete\n`);
