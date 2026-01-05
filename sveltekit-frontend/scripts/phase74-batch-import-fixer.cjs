#!/usr/bin/env node
/**
 * Phase 74: Batch Import Corruption Fixer
 * Fixes patterns like: import { foo: foo } from 'bar'; -> import { foo } from 'bar';
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Phase 74: Scanning for import corruption patterns...\n');

// Find all TypeScript files
const findCmd = 'powershell -Command "Get-ChildItem -Path src -Recurse -Filter *.ts | ForEach-Object { $_.FullName }"';
let files;
try {
    files = execSync(findCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
        .split('\n')
        .filter(f => f.trim())
        .map(f => f.trim());
} catch (e) {
    console.error('Failed to find files:', e.message);
    process.exit(1);
}

console.log(`Found ${files.length} TypeScript files\n`);

// Pattern: { identifier: identifier } -> { identifier }
// This matches destructuring with redundant alias like { foo: foo }
const importCorruptionPattern = /\{\s*(\w+)\s*:\s*\1\s*\}/g;

// Pattern for template literal corruption: ${ foo: foo } -> ${ foo }
const templateCorruptionPattern = /\$\{\s*(\w+)\s*:\s*\1\s*\}/g;

// Track fixes
const dryRun = process.argv.includes('--dry-run');
const fixes = [];
let totalFixed = 0;

for (const file of files) {
    if (!fs.existsSync(file)) continue;

    try {
        let content = fs.readFileSync(file, 'utf-8');
        let originalContent = content;
        let fileFixCount = 0;

        // Fix import/destructuring corruption: { foo: foo } -> { foo }
        content = content.replace(importCorruptionPattern, (match, identifier) => {
            fileFixCount++;
            return `{ ${identifier} }`;
        });

        // Fix template literal corruption: ${ foo: foo } -> ${foo}
        content = content.replace(templateCorruptionPattern, (match, identifier) => {
            fileFixCount++;
            return `\${${identifier}}`;
        });

        if (fileFixCount > 0) {
            const relativePath = path.relative(process.cwd(), file);
            fixes.push({ file: relativePath, count: fileFixCount });
            totalFixed += fileFixCount;

            if (!dryRun) {
                fs.writeFileSync(file, content, 'utf-8');
                console.log(`✅ Fixed ${fileFixCount} corruptions: ${relativePath}`);
            } else {
                console.log(`[DRY-RUN] Would fix ${fileFixCount} corruptions: ${relativePath}`);
            }
        }
    } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
    }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`📊 Summary:`);
console.log(`   Files scanned: ${files.length}`);
console.log(`   Files with corruption: ${fixes.length}`);
console.log(`   Total corruptions found: ${totalFixed}`);
console.log(`${'='.repeat(60)}`);

if (dryRun) {
    console.log(`\n⚠️  DRY RUN - No changes made.`);
    console.log(`   Run without --dry-run to apply fixes.\n`);
} else {
    console.log(`\n✨ Phase 74 Batch Fix Complete!\n`);
}

// Output list of fixed files
if (fixes.length > 0) {
    console.log(`\n📁 Affected files:`);
    fixes.slice(0, 50).forEach((f, i) => {
        console.log(`   ${i + 1}. ${f.file} (${f.count} fixes)`);
    });
    if (fixes.length > 50) {
        console.log(`   ... and ${fixes.length - 50} more files`);
    }
}
