#!/usr/bin/env node
/**
 * Phase 26.5: Normalize svelte-check output → JSONL
 * 
 * Strips ANSI codes, parses errors, and produces structured output
 * for GPU AST verifier (Phase 27) and Gemma3 repair loop (Phase 28)
 * 
 * Input:  svelte-check-output.txt (raw with ANSI codes)
 * Output: normalized-errors.jsonl (structured JSON lines)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INPUT_FILE = path.join(__dirname, '..', 'svelte-check-output.txt');
const OUTPUT_FILE = path.join(__dirname, '..', 'normalized-errors.jsonl');
const SUMMARY_FILE = path.join(__dirname, '..', 'error-normalization-summary.json');

console.log('🔍 Phase 26.5: Error Normalization Pipeline');
console.log('=' .repeat(60));

// Read raw svelte-check output
let raw;
try {
  raw = fs.readFileSync(INPUT_FILE, 'utf8');
  console.log(`✓ Read ${(raw.length / 1024 / 1024).toFixed(2)}MB from ${path.basename(INPUT_FILE)}`);
} catch (err) {
  console.error(`❌ Could not read ${INPUT_FILE}:`, err.message);
  process.exit(1);
}

// Strip ANSI color codes
const cleanText = raw.replace(/\x1b\[[0-9;]*m/g, '');

// Parse different error types
const errors = [];
const errorTypes = {
  preprocessing: 0,
  typescript: 0,
  svelte: 0,
  css: 0,
  other: 0
};

// Pattern 1: Preprocessing errors (CssSyntaxError, etc.)
const preprocessingPattern = /Preprocessing failed[\s\S]*?(\w+Error):\s*(?:\[postcss\]\s*)?(.+?)\n.*?at\s+(.+?)(?:\(|$)/g;
let match;
while ((match = preprocessingPattern.exec(cleanText)) !== null) {
  const [, errorType, message, location] = match;
  
  // Extract file path from location or message
  const fileMatch = location.match(/([a-zA-Z]:[\\\/].+?\.svelte)/i) || 
                    message.match(/([a-zA-Z]:[\\\/].+?\.svelte)/i);
  
  if (fileMatch) {
    const filePath = fileMatch[1].replace(/\\/g, '/');
    const lineMatch = message.match(/:(\d+):(\d+)/);
    
    errors.push({
      type: 'preprocessing',
      errorType,
      message: message.split('\n')[0].trim(),
      file: filePath,
      line: lineMatch ? parseInt(lineMatch[1]) : 0,
      column: lineMatch ? parseInt(lineMatch[2]) : 0,
      severity: 'error'
    });
    errorTypes.preprocessing++;
  }
}

// Pattern 2: TypeScript errors in Svelte files
const tsPattern = /Error:\s*\(ts\)\s*(.+?)\s*\n\s*Diagnostic:\s*(.+?)\s*\n\s*URL:\s*https:\/\/typescript\.tv\/errors\/#(.+?)\s*\n\s*File:\s*(.+?):(\d+):(\d+)/g;
while ((match = tsPattern.exec(cleanText)) !== null) {
  const [, message, diagnostic, errorCode, file, line, column] = match;
  
  errors.push({
    type: 'typescript',
    errorType: `TS${errorCode}`,
    message: message.trim(),
    diagnostic: diagnostic.trim(),
    file: file.replace(/\\/g, '/'),
    line: parseInt(line),
    column: parseInt(column),
    severity: 'error',
    url: `https://typescript.tv/errors/#${errorCode}`
  });
  errorTypes.typescript++;
}

// Pattern 3: Generic Svelte errors
const sveltePattern = /Error:\s*(.+?)\s*\n.*?File:\s*(.+?):(\d+):(\d+)/g;
while ((match = sveltePattern.exec(cleanText)) !== null) {
  const [, message, file, line, column] = match;
  
  // Skip if already captured by other patterns
  const isDuplicate = errors.some(e => 
    e.file === file.replace(/\\/g, '/') && 
    e.line === parseInt(line) && 
    e.column === parseInt(column)
  );
  
  if (!isDuplicate) {
    errors.push({
      type: 'svelte',
      message: message.trim(),
      file: file.replace(/\\/g, '/'),
      line: parseInt(line),
      column: parseInt(column),
      severity: 'error'
    });
    errorTypes.svelte++;
  }
}

// Pattern 4: CSS/PostCSS errors (from preprocessing output above)
const cssPattern = /(?:CssSyntaxError|postcss)[\s\S]*?:(\d+):(\d+):\s*(.+?)\n/g;
while ((match = cssPattern.exec(cleanText)) !== null) {
  const [, line, column, message] = match;
  
  // Find associated file from context
  const contextStart = Math.max(0, match.index - 500);
  const context = cleanText.substring(contextStart, match.index);
  const fileMatch = context.match(/([a-zA-Z]:[\\\/].+?\.svelte)/i);
  
  if (fileMatch) {
    const isDuplicate = errors.some(e => 
      e.type === 'preprocessing' && 
      e.file === fileMatch[1].replace(/\\/g, '/') &&
      e.line === parseInt(line)
    );
    
    if (!isDuplicate) {
      errors.push({
        type: 'css',
        message: message.trim(),
        file: fileMatch[1].replace(/\\/g, '/'),
        line: parseInt(line),
        column: parseInt(column),
        severity: 'error'
      });
      errorTypes.css++;
    }
  }
}

// Deduplicate errors
const uniqueErrors = [];
const seen = new Set();

for (const error of errors) {
  const key = `${error.file}:${error.line}:${error.column}:${error.message}`;
  if (!seen.has(key)) {
    seen.add(key);
    uniqueErrors.push(error);
  }
}

// Group by file
const byFile = {};
for (const error of uniqueErrors) {
  if (!byFile[error.file]) {
    byFile[error.file] = [];
  }
  byFile[error.file].push(error);
}

// Write JSONL output
const jsonlLines = uniqueErrors.map(e => JSON.stringify(e)).join('\n');
fs.writeFileSync(OUTPUT_FILE, jsonlLines, 'utf8');

// Create summary
const summary = {
  timestamp: new Date().toISOString(),
  inputFile: INPUT_FILE,
  outputFile: OUTPUT_FILE,
  totalErrors: uniqueErrors.length,
  errorsByType: errorTypes,
  filesAffected: Object.keys(byFile).length,
  topFiles: Object.entries(byFile)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20)
    .map(([file, errors]) => ({
      file: file.split('/').pop(),
      errors: errors.length,
      types: [...new Set(errors.map(e => e.type))]
    })),
  sampleErrors: uniqueErrors.slice(0, 10).map(e => ({
    type: e.type,
    file: e.file.split('/').pop(),
    line: e.line,
    message: e.message.substring(0, 100)
  }))
};

fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf8');

// Print results
console.log('\n📊 Normalization Results:');
console.log('=' .repeat(60));
console.log(`Total errors parsed:     ${uniqueErrors.length.toLocaleString()}`);
console.log(`Files affected:          ${Object.keys(byFile).length.toLocaleString()}`);
console.log('');
console.log('Errors by type:');
for (const [type, count] of Object.entries(errorTypes)) {
  if (count > 0) {
    console.log(`  ${type.padEnd(20)} ${count.toLocaleString()}`);
  }
}

console.log('\n🔝 Top 10 Files with Most Errors:');
console.log('─'.repeat(60));
summary.topFiles.slice(0, 10).forEach((item, i) => {
  console.log(`${(i + 1).toString().padStart(2)}. ${item.file.padEnd(40)} ${item.errors.toString().padStart(4)} errors`);
});

console.log('\n✅ Output files created:');
console.log(`   📄 ${path.basename(OUTPUT_FILE)} (${uniqueErrors.length} errors)`);
console.log(`   📊 ${path.basename(SUMMARY_FILE)}`);

console.log('\n🎯 Ready for Phase 27 (GPU AST Verifier)');
console.log('   Next: node scripts/gpu-ast-verifier.mjs');

// Exit with code based on error count
process.exit(uniqueErrors.length > 0 ? 1 : 0);
