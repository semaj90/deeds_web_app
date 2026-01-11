#!/usr/bin/env node
/**
 * Object Literal Corruption Fixer - Phase 66
 * Fixes the most common typescript corruption pattern:
 *
 * Broken:  { key: value prop: value2 }
 * Fixed:   { key: value, prop: value2 }
 *
 * Also fixes:
 * - Missing commas after property values
 * - Colon-instead-of-comma patterns
 *
 * Usage:
 *   node fix-object-literals.mjs --dry-run
 *   node fix-object-literals.mjs --limit 2
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : Infinity;

console.log('🔧 Object Literal Corruption Fixer (Phase 66)');
console.log('==============================================');
console.log(`Mode: ${isDryRun ? '🔍 DRY RUN' : '✏️  LIVE FIX'}`);
if (limit < Infinity) console.log(`Limit: ${limit} files`);
console.log('');

const stats = {
    filesScanned: 0,
    filesFixed: 0,
    missingCommas: 0,
    colonErrors: 0
};

/**
 * Fix object literal corruption patterns
 */
function fixObjectLiteralCorruption(content) {
    let modified = false;
    let newContent = content;
    const fixes = [];

    // Pattern 1: Missing comma between properties
    // { prop1: value1 prop2: value2 } → { prop1: value1, prop2: value2 }
    const missingCommaRegex = /:\s*([^\s,}]+)\s+(\w+):/g;
    if (missingCommaRegex.test(newContent)) {
        const before = newContent;
        newContent = newContent.replace(missingCommaRegex, ': $1, $2:');
        if (before !== newContent) {
            modified = true;
            fixes.push('Missing commas between properties');
            const matches = before.match(missingCommaRegex);
            stats.missingCommas += matches ? matches.length : 0;
        }
    }

    // Pattern 2: Colon instead of comma (e.g., `foo: bar: baz`)
    // This is tricky - only fix if it's clearly wrong (lowercase identifiers)
    const colonInsteadCommaRegex = /:\s*(\w+):\s*(\w+)/g;
    if (colonInsteadCommaRegex.test(newContent)) {
        const before = newContent;
        // Only fix if second identifier starts lowercase (likely a property, not a type)
        newContent = newContent.replace(/:\s*(\w+):\s*([a-z]\w+)/g, ': $1, $2');
        if (before !== newContent) {
            modified = true;
            fixes.push('Colon-instead-of-comma');
            stats.colonErrors++;
        }
    }

    return { modified, newContent, fixes };
}

/**
 * Process a single file
 */
function processFile(filePath) {
    stats.filesScanned++;

    const content = fs.readFileSync(filePath, 'utf-8');
    const { modified, newContent, fixes } = fixObjectLiteralCorruption(content);

    if (modified) {
        const relativePath = path.relative(process.cwd(), filePath);

        if (isDryRun) {
            console.log(`\n📄 ${relativePath}`);
            console.log(`   Patterns: ${fixes.join(', ')}`);

            // Show first fix
            const lines = content.split('\n');
            const newLines = newContent.split('\n');
            for (let i = 0; i < Math.min(lines.length, newLines.length); i++) {
                if (lines[i] !== newLines[i]) {
                    console.log(`   Line ${i + 1}:`);
                    console.log(`   - ${lines[i].trim().substring(0, 80)}`);
                    console.log(`   + ${newLines[i].trim().substring(0, 80)}`);
                    break;
                }
            }
        } else {
            console.log(`✓ ${relativePath} (${fixes.join(', ')})`);
            fs.writeFileSync(filePath, newContent, 'utf-8');
        }

        stats.filesFixed++;
        return true;
    }

    return false;
}

/**
 * Recursively get all TypeScript/JavaScript files
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (!['node_modules', '.svelte-kit', '.git', 'build'].includes(file)) {
                arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
            }
        } else if (/\.(ts|js|svelte)$/.test(file)) {
            arrayOfFiles.push(fullPath);
        }
    });

    return arrayOfFiles;
}

/**
 * Main execution
 */
async function main() {
    const srcDir = path.resolve(__dirname, '../src');
    const files = getAllFiles(srcDir);

    console.log(`📂 Scanning ${files.length} files...\n`);

    let processedCount = 0;
    for (const file of files) {
        if (processedCount >= limit) {
            console.log(`\n⚠️  Reached limit of ${limit} files`);
            break;
        }

        if (processFile(file)) {
            processedCount++;
        }
    }

    // Summary
    console.log('\n==============================================');
    console.log('📊 Summary:');
    console.log(`   Files scanned: ${stats.filesScanned}`);
    console.log(`   Files ${isDryRun ? 'would be' : ''} fixed: ${stats.filesFixed}`);
    console.log('\n🔧 Patterns fixed:');
    if (stats.missingCommas > 0) console.log(`   ✓ Missing commas: ${stats.missingCommas}`);
    if (stats.colonErrors > 0) console.log(`   ✓ Colon errors: ${stats.colonErrors}`);

    if (isDryRun) {
        console.log('\n💡 Run without --dry-run to apply fixes');
        console.log('💡 Use --limit N to fix only N files');
    } else {
        console.log('\n✅ Fixes applied! Run svelte-check to verify.');
    }
}

main().catch(console.error);
