#!/usr/bin/env node
/**
 * Phase 103.2 ACE Auto-Fix Script - REFINED PATTERNS
 * Learned from Phase 103.1 regression (+194 errors)
 *
 * KEY IMPROVEMENTS:
 * - Removed DataView API patterns (false positives)
 * - Removed constructor patterns (false positives)
 * - Added $1;$2 corruption pattern (HIGH confidence)
 * - Test on 10 files before full scan
 *
 * Usage:
 *   node scripts/phase103.2-refined-autofix.mjs              # Dry-run (10 files)
 *   node scripts/phase103.2-refined-autofix.mjs --apply --max=10
 *   node scripts/phase103.2-refined-autofix.mjs --apply --max=50
 *   node scripts/phase103.2-refined-autofix.mjs --apply --full
 */

import { execSync } from 'child_process';
import fs from 'fs';

// Parse CLI args
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FULL_SCAN = args.includes('--full');
const MAX_FILES = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] || '10');

// REFINED PATTERNS - Only HIGH confidence, no DataView/constructor patterns
const SAFE_PATTERNS = [
    {
        name: 'dollar_sign_corruption',
        description: '$1;$2 artifacts → clean syntax',
        pattern: /\$1;\$2\s+/g,
        replacement: '',
        priority: 1,
        confidence: 'HIGH',
        examples: ['$1;$2  typeof env', '$1;$2  const x']
    },
    {
        name: 'interface_property',
        description: 'prop, Type; → prop: Type;',
        pattern: /^(\s+)([a-zA-Z_][a-zA-Z0-9_?]*),\s+(Date|string|number|boolean|unknown|any|void|null|undefined)\s*;/gm,
        replacement: '$1$2: $3;',
        priority: 2,
        confidence: 'HIGH',
        examples: ['  name, string;', '  age, number;']
    },
    {
        name: 'index_signature',
        description: '[key, string] → [key: string]',
        pattern: /\[([a-zA-Z_][a-zA-Z0-9_]*),\s+(string|number|symbol)\]/g,
        replacement: '[$1: $2]',
        priority: 3,
        confidence: 'HIGH',
        examples: ['[key, string]', '[id, number]']
    },
    {
        name: 'question_mark_chain',
        description: '????? artifacts → empty string',
        pattern: /\?\?\?\?\?\.?/g,
        replacement: '',
        priority: 4,
        confidence: 'MEDIUM',
        examples: ['?????', '?????.method']
    }
];

/**
 * Get TypeScript files using git ls-files
 */
function getTypeScriptFiles() {
    try {
        const output = execSync('git ls-files "*.ts" "*.tsx"', {
            encoding: 'utf-8',
            cwd: process.cwd()
        });
        return output.trim().split('\n').filter(f =>
            f &&
            !f.includes('.d.ts') &&
            !f.includes('node_modules') &&
            !f.includes('.svelte-kit')
        );
    } catch (error) {
        console.error('Failed to get git files, falling back to all .ts files');
        return [];
    }
}

/**
 * Scan a file for fixable patterns
 */
function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fixes = [];
    let totalFixes = 0;

    for (const pattern of SAFE_PATTERNS) {
        const matches = content.match(pattern.pattern) || [];
        if (matches.length > 0) {
            fixes.push({
                pattern: pattern.name,
                description: pattern.description,
                confidence: pattern.confidence,
                count: matches.length,
                examples: matches.slice(0, 2)
            });
            totalFixes += matches.length;
        }
    }

    return {
        file: filePath,
        fixes,
        totalFixes
    };
}

/**
 * Apply fixes to a file
 */
function applyFixes(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    let totalApplied = 0;

    for (const pattern of SAFE_PATTERNS) {
        const beforeCount = (content.match(pattern.pattern) || []).length;
        if (beforeCount > 0) {
            content = content.replace(pattern.pattern, pattern.replacement);
            const afterCount = (content.match(pattern.pattern) || []).length;
            const applied = beforeCount - afterCount;
            totalApplied += applied;
        }
    }

    if (totalApplied > 0) {
        // Backup original
        const backupPath = filePath + '.phase103.2.bak';
        fs.writeFileSync(backupPath, originalContent);

        // Apply changes
        fs.writeFileSync(filePath, content);

        return { applied: totalApplied, backup: backupPath };
    }

    return { applied: 0, backup: null };
}

/**
 * Get initial TSC error count
 */
function getTSCErrorCount() {
    try {
        execSync('npx tsc --noEmit --skipLibCheck 2>&1', {
            encoding: 'utf-8',
            stdio: 'pipe'
        });
        return 0; // No errors
    } catch (error) {
        const output = error.stdout || error.stderr || '';
        const match = output.match(/Found (\d+) errors?/);
        return match ? parseInt(match[1]) : 999999;
    }
}

/**
 * Revert all backups
 */
function revertAllBackups(backups) {
    console.log('\n⚠️  Reverting all changes...');
    for (const backup of backups) {
        if (backup && fs.existsSync(backup)) {
            const original = backup.replace('.phase103.2.bak', '');
            fs.copyFileSync(backup, original);
            fs.unlinkSync(backup);
        }
    }
    console.log('✅ All changes reverted.');
}

/**
 * Main execution
 */
async function main() {
    console.log('\n======================================================================');
    console.log('🔧 PHASE 103.2 ACE Auto-Fix (REFINED PATTERNS)');
    console.log(`   Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`   Scope: ${FULL_SCAN ? 'Full scan' : `Up to ${MAX_FILES} files`}`);
    console.log('======================================================================\n');

    console.log('📂 Scanning for TypeScript files...');
    const allFiles = getTypeScriptFiles();
    console.log(`   Found ${allFiles.length} TypeScript files\n`);

    // Scan all files
    const scannedFiles = allFiles.map(scanFile).filter(f => f.totalFixes > 0);

    // Sort by total fixes (descending)
    scannedFiles.sort((a, b) => b.totalFixes - a.totalFixes);

    console.log(`📊 Files with fixable patterns: ${scannedFiles.length}\n`);

    if (scannedFiles.length === 0) {
        console.log('✨ No fixable patterns found. All clean!');
        return;
    }

    // Limit files if not full scan
    const filesToProcess = FULL_SCAN ? scannedFiles : scannedFiles.slice(0, MAX_FILES);

    // Show top files
    console.log('Top files:');
    filesToProcess.slice(0, 20).forEach(f => {
        console.log(`   ${f.file}: ${f.totalFixes} fixes`);
        f.fixes.forEach(fix => {
            console.log(`      - ${fix.pattern}: ${fix.count} (${fix.description}) [${fix.confidence}]`);
        });
    });

    const totalFixesAvailable = filesToProcess.reduce((sum, f) => sum + f.totalFixes, 0);
    console.log(`\n📈 Total fixes available: ${totalFixesAvailable}\n`);

    // Show breakdown by pattern
    const patternStats = {};
    filesToProcess.forEach(f => {
        f.fixes.forEach(fix => {
            if (!patternStats[fix.pattern]) {
                patternStats[fix.pattern] = {
                    count: 0,
                    description: fix.description,
                    confidence: fix.confidence
                };
            }
            patternStats[fix.pattern].count += fix.count;
        });
    });

    console.log('By pattern:');
    Object.entries(patternStats).forEach(([name, stats]) => {
        console.log(`   - ${name}: ${stats.count} (${stats.description}) [${stats.confidence}]`);
    });

    if (!APPLY) {
        console.log('\n⚠️  DRY-RUN complete. No files modified.');
        console.log('   To apply fixes: node scripts/phase103.2-refined-autofix.mjs --apply --max=10');
        console.log('   To apply all: node scripts/phase103.2-refined-autofix.mjs --apply --full\n');

        // Save scan results
        const resultsPath = 'scripts/phase103.2-scan-results.json';
        fs.writeFileSync(resultsPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            totalFiles: filesToProcess.length,
            totalFixes: totalFixesAvailable,
            patterns: patternStats,
            topFiles: filesToProcess.slice(0, 50)
        }, null, 2));
        console.log(`📝 Scan results saved to: ${resultsPath}`);
        return;
    }

    // APPLY MODE
    console.log('\n🚀 Applying fixes...');
    console.log('📊 Getting initial TSC error count...');
    const initialErrors = getTSCErrorCount();
    console.log(`   Initial errors: ${initialErrors}\n`);

    const backups = [];
    let filesFixed = 0;
    let totalFixesApplied = 0;

    for (const fileInfo of filesToProcess) {
        const result = applyFixes(fileInfo.file);
        if (result.applied > 0) {
            console.log(`   ✅ ${fileInfo.file}: ${result.applied} fixes applied`);
            backups.push(result.backup);
            filesFixed++;
            totalFixesApplied += result.applied;
        }
    }

    console.log(`\n📊 Verifying changes...`);
    const finalErrors = getTSCErrorCount();
    const errorChange = finalErrors - initialErrors;

    console.log(`   Final errors: ${finalErrors}`);
    console.log(`   Change: ${errorChange > 0 ? '+' : ''}${errorChange} errors\n`);

    if (errorChange > 0) {
        console.log('⚠️  REGRESSION DETECTED! Reverting...');
        revertAllBackups(backups);
        console.log('\n❌ Phase 103.2 failed with regression. Manual review required.');
        process.exit(1);
    } else {
        // Success! Clean up backups
        console.log('✅ No regression detected! Cleaning up backups...');
        backups.forEach(backup => {
            if (backup && fs.existsSync(backup)) {
                fs.unlinkSync(backup);
            }
        });
    }

    console.log('\n======================================================================');
    console.log('📊 FINAL SUMMARY');
    console.log(`   Files processed: ${filesFixed}`);
    console.log(`   Total fixes applied: ${totalFixesApplied}`);
    console.log(`   Error reduction: ${-errorChange}`);
    console.log('======================================================================\n');
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
