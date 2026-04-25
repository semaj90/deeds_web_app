#!/usr/bin/env node
/**
 * Phase 90: Simple Test Wrapper
 * Direct execution without import.meta check
 */

import { processFile } from './phase90-ast-fixer.mjs';

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const dryRun = args.includes('--dry-run');

if (fileIndex === -1 || !args[fileIndex + 1]) {
    console.error('Usage: node run-phase90-test.mjs --file <path> [--dry-run]');
    process.exit(1);
}

const filePath = args[fileIndex + 1];

console.log('🧪 Phase 90 Test Wrapper');
console.log(`📄 File: ${filePath}`);
console.log(`🔍 Dry run: ${dryRun ? 'YES' : 'NO'}\n`);

processFile(filePath)
    .then(result => {
        console.log('\n✅ Test complete');
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    });
