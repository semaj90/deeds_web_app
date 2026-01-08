#!/usr/bin/env node
/**
 * Phase 90 Batch 15: Next 50 Files (ranks 306-355)
 * With 3 NEW high-confidence patterns from web research (UnionType 95%, ForStatement 90%, TypeAliasDeclaration 90%)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
process.chdir(projectRoot);

import('./phase90-enhanced-ast-fixer.mjs').then(async (module) => {
    const { processFile } = module;

    const cascadeMultiplier = 1.84; // Phase 89 validated

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║ Phase 90 Batch 15: Files 306-355 with 7 KAG Patterns (4+3)   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`📁 Working Directory: ${process.cwd()}\n`);

    // Load error files ranked by error count
    const errorFilesPath = path.join(projectRoot, 'reports/top-100-error-files.json');

    if (!fs.existsSync(errorFilesPath)) {
        console.error('❌ Error: top-100-error-files.json not found!');
        console.log('Run: node scripts/generate-error-ranking.mjs');
        process.exit(1);
    }

    const errorData = JSON.parse(fs.readFileSync(errorFilesPath, 'utf-8'));

    // We need all ranked files, not just top 100. Let's generate a fresh ranking for files 306-355
    console.log('📊 Generating fresh error ranking for Batch 15 files...\n');

    // Get all TypeScript files with errors
    const { execSync } = await import('child_process');
    const tscOutput = execSync('npx tsc --noEmit 2>&1', { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });

    const errorCounts = new Map();
    const lines = tscOutput.split('\n');

    for (const line of lines) {
        const match = line.match(/^(src\/[^(]+)\((\d+),(\d+)\): error TS(\d+):/);
        if (match) {
            const [, file] = match;
            errorCounts.set(file, (errorCounts.get(file) || 0) + 1);
        }
    }

    // Convert to array and sort by error count descending
    const allFiles = Array.from(errorCounts.entries())
        .map(([file, count]) => ({ File: file, Errors: count }))
        .sort((a, b) => b.Errors - a.Errors);

    console.log(`📈 Total files with errors: ${allFiles.length}`);

    // Take files ranked 306-355 (indices 305-354)
    const batch15Files = allFiles.slice(305, 355);

    if (batch15Files.length === 0) {
        console.log('✅ No files in rank 306-355 range (codebase may have < 305 error files)');
        process.exit(0);
    }

    console.log(`📊 Batch 15: Processing ${batch15Files.length} files (ranks 306-${305 + batch15Files.length})\n`);

    const results = {
        batch: 15,
        timestamp: new Date().toISOString(),
        filesProcessed: 0,
        successful: 0,
        failed: 0,
        rollbacks: [],
        totalFixes: 0,
        visibleErrorReduction: 0,
        fileResults: []
    };

    for (let i = 0; i < batch15Files.length; i++) {
        const fileInfo = batch15Files[i];
        const rank = 306 + i;
        const filePath = fileInfo.File;

        console.log(`\n${'─'.repeat(66)}`);
        console.log(`📄 [Rank ${rank}] ${path.basename(filePath)}`);
        console.log(`   Path: ${filePath}`);
        console.log(`   Errors: ${fileInfo.Errors}`);

        try {
            const result = await processFile(filePath);
            results.filesProcessed++;

            if (result.rolledBack) {
                results.rollbacks.push(filePath);
                results.failed++;
                console.log(`   ⚠️  ROLLED BACK (errors increased)`);
            } else if (result.fixesApplied > 0) {
                results.successful++;
                results.totalFixes += result.fixesApplied;
                const errorDelta = (result.errorsBefore || 0) - (result.errorsAfter || 0);
                results.visibleErrorReduction += errorDelta;
                console.log(`   ✅ Success: ${result.fixesApplied} fixes, ${errorDelta} error delta`);
            } else {
                results.failed++;
                console.log(`   ⏭️  Skipped: No fixes applied`);
            }

            results.fileResults.push({
                file: filePath,
                errors: fileInfo.Errors,
                rank: rank,
                ...result
            });

        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
            results.failed++;
            results.fileResults.push({
                file: filePath,
                errors: fileInfo.Errors,
                rank: rank,
                error: error.message
            });
        }

        // Delay between files
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Calculate metrics
    const successRate = (results.successful / results.filesProcessed * 100).toFixed(1);
    const estimatedCascade = Math.round(results.visibleErrorReduction * cascadeMultiplier);

    console.log('\n' + '═'.repeat(66));
    console.log('📊 BATCH 15 SUMMARY\n');
    console.log(`   Files Processed:       ${results.filesProcessed}/${batch15Files.length}`);
    console.log(`   Successful:            ${results.successful} (${successRate}%)`);
    console.log(`   Failed/Skipped:        ${results.failed}`);
    console.log(`   Rollbacks:             ${results.rollbacks.length}`);
    console.log(`   Total Fixes Applied:   ${results.totalFixes}`);
    console.log(`   Visible Reduction:     ${results.visibleErrorReduction} errors`);
    console.log(`   Est. Cascade Impact:   ~${estimatedCascade} errors (${cascadeMultiplier}x)`);
    console.log('═'.repeat(66) + '\n');

    // Save results
    const outputPath = path.join(projectRoot, 'reports/phase90-batch15-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`✅ Results saved: ${outputPath}\n`);

    console.log('🎯 NEW PATTERNS DEPLOYED IN BATCH 15:\n');
    console.log('   1. UnionType (95%): Skip comma fixes near | separator');
    console.log('   2. ForStatement (90%): Commas only in init/afterthought sections');
    console.log('   3. TypeAliasDeclaration (90%): Commas only in object props, not unions\n');

}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
