#!/usr/bin/env node
/**
 * Phase 91 Test Run - Validate Type-Safe Fixer on 5 Files
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { runPhase91Enhanced } from './phase91-enhanced-type-safe-fixer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get files from next-100 list
const next100Path = path.join(__dirname, '../reports/next-100-high-error-files.json');

if (!fs.existsSync(next100Path)) {
    console.error('❌ next-100-high-error-files.json not found');
    console.error('   Run: npx tsc --noEmit 2>&1 | ... to generate it');
    process.exit(1);
}

const next100 = JSON.parse(fs.readFileSync(next100Path, 'utf-8'));

// Take first 5 files for testing
const testFiles = next100
    .slice(0, 5)
    .map(entry => path.join(__dirname, '..', entry.File));

console.log('\n🧪 Phase 91 Test Run - 5 Files\n');
console.log('Files to process:');
testFiles.forEach((f, i) => {
    console.log(`   ${i + 1}. ${path.basename(f)}`);
});

// Run enhanced fixer
await runPhase91Enhanced(testFiles);
