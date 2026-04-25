#!/usr/bin/env node
/**
 * Phase 90 AST Fixer - Test Script
 * Simple test to verify TypeScript Compiler API integration
 */

import * as fs from 'fs';
import * as ts from 'typescript';

console.log('🧪 Phase 90 AST Fixer - Test Mode');
console.log('═'.repeat(60));

// Test file
const testFile = 'src/lib/services/llm-router.ts';

if (!fs.existsSync(testFile)) {
    console.error(`❌ Test file not found: ${testFile}`);
    process.exit(1);
}

console.log(`\n📄 Loading: ${testFile}`);

// Load and parse
const content = fs.readFileSync(testFile, 'utf-8');
const sourceFile = ts.createSourceFile(
    testFile,
    content,
    ts.ScriptTarget.Latest,
    true // setParentNodes
);

console.log(`✅ Parsed successfully`);
console.log(`   Lines: ${sourceFile.getLineAndCharacterOfPosition(sourceFile.end).line + 1}`);

// Get diagnostics WITHOUT full program (syntax-only)
// This avoids module resolution issues
const diagnostics = sourceFile.parseDiagnostics;

console.log(`\n📊 Diagnostics:`);
console.log(`   Total errors: ${diagnostics.length}`);

// Filter TS1005 errors
const ts1005 = diagnostics.filter(d => d.code === 1005);
console.log(`   TS1005 errors: ${ts1005.length}`);

// Show first 5 TS1005 errors
console.log(`\n🔍 First 5 TS1005 errors:`);
ts1005.slice(0, 5).forEach((diag, idx) => {
    const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
    const pos = sourceFile.getLineAndCharacterOfPosition(diag.start || 0);
    console.log(`   ${idx + 1}. Line ${pos.line + 1}: ${message}`);
});

console.log(`\n✅ Test complete - AST API working correctly`);
