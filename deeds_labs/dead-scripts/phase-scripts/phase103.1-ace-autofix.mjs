#!/usr/bin/env node
/**
 * Phase 103.1 ACE Auto-Fix Script
 * Safe, incremental pattern fixes with validation
 * Usage:
 *   node scripts/phase103.1-ace-autofix.mjs           # Dry-run
 *   node scripts/phase103.1-ace-autofix.mjs --apply --max=100
 *   node scripts/phase103.1-ace-autofix.mjs --apply --full
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { execSync } from 'child_process';

// Parse CLI args
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FULL_SCAN = args.includes('--full');
const MAX_FILES = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] || '50');

// Safe, proven patterns
const SAFE_PATTERNS = [
    {
        name: 'index_signature',
        description: '[key, string] → [key: string]',
        pattern: /\[([a-zA-Z_][a-zA-Z0-9_]*),\s*(string|number)\]/g,
        replacement: '[$1: $2]',
        priority: 1
    },
    {
        name: 'interface_property',
        description: 'prop, Type; → prop: Type;',
        pattern: /(\s+)([a-zA-Z_][a-zA-Z0-9_?]*),\s*(Date|string|number|boolean|unknown|any|void)\s*;/g,
        replacement: '$1$2: $3;',
        priority: 2
    },
    {
        name: 'method_chain_colon',
        description: '.method(a: b: c) → .method(a, b, c)',
        pattern: /\.(setex|get|set|put|delete)\(([^:)]+):\s*([^:)]+):\s*([^)]+)\)/g,
        replacement: '.$1($2, $3, $4)',
        priority: 3
    },
    {
        name: 'constructor_colon_to_comma',
        description: 'new Class(a: b) → new Class(a, b)',
        pattern: /new\s+([A-Z][a-zA-Z0-9]+)\(([^,)]+):\s*([^,)]+)\)/g,
        replacement: 'new $1($2, $3)',
        priority: 4
    }
];

/**
 * Scan a file for fixable patterns
 */
function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fixes = [];

    for (const pattern of SAFE_PATTERNS) {
        const matches = content.match(pattern.pattern) || [];
        if (matches.length > 0) {
            fixes.push({
                pattern: pattern.name,
                description: pattern.description,
                count: matches.length,
                examples: matches.slice(0, 2)
            });
        }
    }

    return {
        file: filePath,
        fixes,
        totalFixes: fixes.reduce((sum, f) => sum + f.count, 0)
    };
}

/**
 * Apply fixes to a file
 */
function applyFixes(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let totalApplied = 0;

    for (const pattern of SAFE_PATTERNS) {
        const beforeCount = (content.match(pattern.pattern) || []).length;
        if (beforeCount > 0) {
            content = content.replace(pattern.pattern, pattern.replacement);
            totalApplied += beforeCount;
        }
    }

    if (totalApplied > 0) {
        // Backup
        fs.writeFileSync(filePath + '.phase103.1.bak', fs.readFileSync(filePath));
        // Apply
        fs.writeFileSync(filePath, content);
    }

    return totalApplied;
}

/**
 * Get TSC error count
 */
function getTscErrorCount() {
    try {
        const output = execSync('npx tsc --noEmit 2>&1', {
            encoding: 'utf-8',
            maxBuffer: 100 * 1024 * 1024,
            timeout: 300000
        });
        return (output.match(/error TS\d+/g) || []).length;
    } catch (e) {
        const output = e.stdout || e.stderr || '';
        return (output.match(/error TS\d+/g) || []).length;
    }
}

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('🔧 PHASE 103.1 ACE Auto-Fix');
    console.log(`   Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`   Scope: ${FULL_SCAN ? 'FULL CODEBASE' : `Up to ${MAX_FILES} files`}`);
    console.log('='.repeat(70) + '\n');

    // Find TypeScript files
    console.log('📂 Scanning for TypeScript files...');
    const files = await glob('src/**/*.ts', {
        ignore: ['**/*.d.ts', '**/node_modules/**', '**/*.bak']
    });
    console.log(`   Found ${files.length} TypeScript files\n`);

    // Scan all files for patterns
    const scanResults = [];
    for (const file of files) {
        const result = scanFile(file);
        if (result.totalFixes > 0) {
            scanResults.push(result);
        }
    }

    // Sort by fix count
    scanResults.sort((a, b) => b.totalFixes - a.totalFixes);

    console.log(`📊 Files with fixable patterns: ${scanResults.length}\n`);

    // Show top files
    console.log('Top files:');
    for (const result of scanResults.slice(0, 20)) {
        console.log(`   ${result.file}: ${result.totalFixes} fixes`);
        result.fixes.forEach(f => {
            console.log(`      - ${f.pattern}: ${f.count} (${f.description})`);
        });
    }

    // Calculate totals
    const totalFixes = scanResults.reduce((sum, r) => sum + r.totalFixes, 0);
    console.log(`\n📈 Total fixes available: ${totalFixes}`);

    // Pattern breakdown
    const patternCounts = {};
    for (const result of scanResults) {
        for (const fix of result.fixes) {
            patternCounts[fix.pattern] = (patternCounts[fix.pattern] || 0) + fix.count;
        }
    }
    console.log('\nBy pattern:');
    Object.entries(patternCounts)
        .sort(([,a], [,b]) => b - a)
        .forEach(([pattern, count]) => {
            const pDef = SAFE_PATTERNS.find(p => p.name === pattern);
            console.log(`   - ${pattern}: ${count} (${pDef?.description || ''})`);
        });

    if (!APPLY) {
        console.log('\n⚠️  DRY-RUN complete. No files modified.');
        console.log('   To apply fixes: node scripts/phase103.1-ace-autofix.mjs --apply');
        console.log('   To apply to first 100: node scripts/phase103.1-ace-autofix.mjs --apply --max=100');
        console.log('   To apply all: node scripts/phase103.1-ace-autofix.mjs --apply --full\n');

        // Save scan results
        fs.writeFileSync('scripts/phase103.1-scan-results.json', JSON.stringify({
            timestamp: new Date().toISOString(),
            filesScanned: files.length,
            filesWithFixes: scanResults.length,
            totalFixes,
            patternCounts,
            files: scanResults
        }, null, 2));
        console.log('📝 Scan results saved to: scripts/phase103.1-scan-results.json\n');
        return;
    }

    // Apply mode
    console.log('\n🚀 Applying fixes...');

    // Get initial error count
    console.log('📊 Getting initial TSC error count...');
    const initialErrors = getTscErrorCount();
    console.log(`   Initial errors: ${initialErrors}`);

    const filesToProcess = FULL_SCAN ? scanResults : scanResults.slice(0, MAX_FILES);
    let totalApplied = 0;
    const processedFiles = [];

    for (const result of filesToProcess) {
        const applied = applyFixes(result.file);
        if (applied > 0) {
            console.log(`   ✅ ${result.file}: ${applied} fixes applied`);
            totalApplied += applied;
            processedFiles.push({ file: result.file, applied });
        }
    }

    // Verify
    console.log('\n📊 Verifying changes...');
    const finalErrors = getTscErrorCount();
    const change = initialErrors - finalErrors;

    console.log(`   Final errors: ${finalErrors}`);
    console.log(`   Change: ${change >= 0 ? '-' : '+'}${Math.abs(change)} errors`);

    if (change < -10) {
        console.log('\n⚠️  REGRESSION DETECTED! Reverting...');
        for (const { file } of processedFiles) {
            const bakPath = file + '.phase103.1.bak';
            if (fs.existsSync(bakPath)) {
                fs.copyFileSync(bakPath, file);
                fs.unlinkSync(bakPath);
            }
        }
        console.log('   Reverted all changes.');
    } else {
        console.log('\n✅ Changes validated successfully!');
        // Clean up backups
        for (const { file } of processedFiles) {
            const bakPath = file + '.phase103.1.bak';
            if (fs.existsSync(bakPath)) {
                fs.unlinkSync(bakPath);
            }
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 FINAL SUMMARY');
    console.log(`   Files processed: ${filesToProcess.length}`);
    console.log(`   Total fixes applied: ${totalApplied}`);
    console.log(`   Error reduction: ${change}`);
    console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
