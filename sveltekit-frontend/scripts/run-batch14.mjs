#!/usr/bin/env node
/**
 * Phase 90 Batch 14: Final 50 Files (files 51-100 from next-100-high-error-files.json)
 * Pushing toward 60%+ total reduction
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

    const cascadeMultiplier = 82.6; // Batches 1-13 validated average

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║    Phase 90 Batch 14: Final 50 Files → Target 60% Reduction   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`📁 Working Directory: ${process.cwd()}\n`);

    // Load next 100 error files
    const errorFilesPath = path.join(projectRoot, 'reports/next-100-high-error-files.json');

    if (!fs.existsSync(errorFilesPath)) {
        console.error('❌ Error: next-100-high-error-files.json not found!');
        console.log('Run this command first:');
        console.log('npx tsc --noEmit 2>&1 | Select-String "error TS" | ForEach-Object { if ($_ -match "src/[^(]+") { $matches[0] } } | Group-Object | Sort-Object Count -Descending | Select-Object -First 100 | ForEach-Object { [PSCustomObject]@{ Errors = $_.Count; File = $_.Name } } | ConvertTo-Json > reports/next-100-high-error-files.json');
        process.exit(1);
    }

    const errorData = JSON.parse(fs.readFileSync(errorFilesPath, 'utf-8'));

    // Take files 51-100 from the next-100 list (remaining half)
    const batch14Files = errorData.slice(50, 100);

    console.log(`📊 Batch 14: Processing ${batch14Files.length} files\n`);
    console.log(`🎯 Current: 38,957 errors (55.6% reduction)`);
    console.log(`🎯 Target:  <35,000 errors (60%+ reduction)\n`);

    const results = {
        batch: 14,
        timestamp: new Date().toISOString(),
        filesProcessed: 0,
        successful: 0,
        failed: 0,
        rollbacks: [],
        totalFixes: 0,
        visibleErrorReduction: 0,
        fileResults: []
    };

    for (let i = 0; i < batch14Files.length; i++) {
        const fileInfo = batch14Files[i];
        const fileNum = i + 51; // Files 51-100
        const filePath = fileInfo.File;

        console.log(`\n${'─'.repeat(66)}`);
        console.log(`📄 [${fileNum}/100] ${path.basename(filePath)}`);
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
                ...result
            });

        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
            results.failed++;
            results.fileResults.push({
                file: filePath,
                errors: fileInfo.Errors,
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
    console.log('📊 BATCH 14 SUMMARY\n');
    console.log(`   Files Processed:       ${results.filesProcessed}/50`);
    console.log(`   Successful:            ${results.successful} (${successRate}%)`);
    console.log(`   Failed/Skipped:        ${results.failed}`);
    console.log(`   Rollbacks:             ${results.rollbacks.length}`);
    console.log(`   Total Fixes Applied:   ${results.totalFixes}`);
    console.log(`   Visible Reduction:     ${results.visibleErrorReduction} errors`);
    console.log(`   Est. Cascade Impact:   ~${estimatedCascade} errors (${cascadeMultiplier}x)`);
    console.log('═'.repeat(66) + '\n');

    // Save results
    const outputPath = path.join(projectRoot, 'reports/phase90-batch14-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`✅ Results saved: ${outputPath}\n`);

    // Display progress toward 60% goal
    const currentErrors = 38957;
    const estimatedFinalErrors = currentErrors - estimatedCascade;
    const estimatedFinalPercent = ((87835 - estimatedFinalErrors) / 87835 * 100).toFixed(1);

    console.log('🎯 PROGRESS TOWARD 60% GOAL:\n');
    console.log(`   Current:        38,957 errors (55.6%)`);
    console.log(`   Est. After B14: ~${estimatedFinalErrors.toLocaleString()} errors (${estimatedFinalPercent}%)`);

    if (estimatedFinalPercent >= 60) {
        console.log(`   ✅ GOAL ACHIEVED! 60%+ reduction expected!\n`);
    } else {
        const errorsNeeded = currentErrors - (87835 * 0.4);
        console.log(`   ⏳ ${Math.round(errorsNeeded - estimatedCascade)} more errors needed for 60%\n`);
    }

}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
