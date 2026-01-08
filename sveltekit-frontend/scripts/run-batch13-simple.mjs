#!/usr/bin/env node
/**
 * Phase 90 Batch 13: Next 50 Files (from next-100-high-error-files.json)
 * Building on Batches 1-12 success
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

    const cascadeMultiplier = 107.2; // Phase 90 validated

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           Phase 90 Batch 13: Next 50 High-Error Files         ║');
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

    // Take first 50 files from the next-100 list
    const batch13Files = errorData.slice(0, 50);

    console.log(`📊 Batch 13: Processing ${batch13Files.length} files\n`);

    const results = {
        batch: 13,
        timestamp: new Date().toISOString(),
        filesProcessed: 0,
        successful: 0,
        failed: 0,
        rollbacks: [],
        totalFixes: 0,
        visibleErrorReduction: 0,
        fileResults: []
    };

    for (let i = 0; i < batch13Files.length; i++) {
        const fileInfo = batch13Files[i];
        const fileNum = i + 1;
        const filePath = fileInfo.File;

        console.log(`\n${'─'.repeat(66)}`);
        console.log(`📄 [${fileNum}/50] ${path.basename(filePath)}`);
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
    console.log('📊 BATCH 13 SUMMARY\n');
    console.log(`   Files Processed:       ${results.filesProcessed}/50`);
    console.log(`   Successful:            ${results.successful} (${successRate}%)`);
    console.log(`   Failed/Skipped:        ${results.failed}`);
    console.log(`   Rollbacks:             ${results.rollbacks.length}`);
    console.log(`   Total Fixes Applied:   ${results.totalFixes}`);
    console.log(`   Visible Reduction:     ${results.visibleErrorReduction} errors`);
    console.log(`   Est. Cascade Impact:   ~${estimatedCascade} errors (${cascadeMultiplier}x)`);
    console.log('═'.repeat(66) + '\n');

    // Save results
    const outputPath = path.join(projectRoot, 'reports/phase90-batch13-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`✅ Results saved: ${outputPath}\n`);

}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
