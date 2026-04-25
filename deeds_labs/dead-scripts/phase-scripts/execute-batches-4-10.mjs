#!/usr/bin/env node
/**
 * Phase 90: Execute Batches 4-10 Sequentially
 *
 * Runs all remaining 70 files (batches 4-10) with proper output and progress tracking.
 * Each batch processes 10 files with pause between batches for system stability.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { processFile } from './phase90-enhanced-ast-fixer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BATCHES_TO_RUN = [4, 5, 6, 7, 8, 9, 10];
const cascadeMultiplier = 1.84;

console.log('╔════════════════════════════════════════════════════════════════════════════╗');
console.log('║         PHASE 90: EXECUTING BATCHES 4-10 (70 Remaining Files)             ║');
console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

// Load error files
const errorFilesPath = path.join(__dirname, '../reports/top-100-error-files.json');
const errorData = JSON.parse(fs.readFileSync(errorFilesPath, 'utf-8'));

let grandTotalFixes = 0;
let grandTotalReduction = 0;
let grandSuccessfulFiles = 0;
const allBatchResults = [];

async function processBatch(batchNumber) {
    const startIdx = (batchNumber - 1) * 10;
    const endIdx = batchNumber * 10;

    const batchFiles = errorData.track1Files.slice(startIdx, endIdx).map(f => ({
        path: f.file,
        errorCount: f.errorCount,
        strategy: f.strategy
    }));

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🚀 BATCH ${batchNumber} - Processing files ${startIdx + 1}-${endIdx}`);
    console.log(`${'═'.repeat(80)}\n`);

    let batchFixes = 0;
    let batchReduction = 0;
    let batchSuccesses = 0;
    const batchResults = [];

    for (let i = 0; i < batchFiles.length; i++) {
        const fileInfo = batchFiles[i];
        const fileNum = startIdx + 1 + i;

        console.log(`\n${'─'.repeat(80)}`);
        console.log(`📄 [${fileNum}/100] ${fileInfo.path}`);
        console.log(`   Errors before: ${fileInfo.errorCount}`);

        try {
            const result = await processFile(fileInfo.path);
            batchResults.push(result);

            if (result.success) {
                const reduction = result.errorsBefore - result.errorsAfter;
                batchFixes += result.fixesApplied || 0;
                batchReduction += reduction;
                batchSuccesses++;

                console.log(`   ✅ Success: ${result.fixesApplied} fixes, ${reduction} errors removed`);
            } else {
                console.log(`   ❌ Failed or rolled back`);
            }
        } catch (error) {
            console.error(`   💥 Error: ${error.message}`);
            batchResults.push({
                filePath: fileInfo.path,
                errorsBefore: fileInfo.errorCount,
                errorsAfter: fileInfo.errorCount,
                fixesApplied: 0,
                success: false,
                error: error.message
            });
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    const estimatedCascade = Math.round(batchReduction * cascadeMultiplier);

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`📊 BATCH ${batchNumber} SUMMARY`);
    console.log(`${'═'.repeat(80)}`);
    console.log(`   ✅ Successful files: ${batchSuccesses}/10`);
    console.log(`   🎯 Total fixes applied: ${batchFixes}`);
    console.log(`   📉 Visible error reduction: ${batchReduction}`);
    console.log(`   🔮 Estimated cascade: ~${estimatedCascade}`);
    console.log(`   📈 Success rate: ${((batchSuccesses / 10) * 100).toFixed(1)}%`);

    // Save batch results
    const resultsPath = path.join(__dirname, `../reports/phase90-batch${batchNumber}-enhanced-results.json`);
    const batchResultsData = {
        batchNumber,
        timestamp: new Date().toISOString(),
        filesProcessed: 10,
        successfulFixes: batchSuccesses,
        totalFixesApplied: batchFixes,
        totalErrorReduction: batchReduction,
        cascadeMultiplier,
        estimatedCascadeReduction: estimatedCascade,
        successRate: ((batchSuccesses / 10) * 100).toFixed(1) + '%',
        results: batchResults
    };

    fs.writeFileSync(resultsPath, JSON.stringify(batchResultsData, null, 2));
    console.log(`💾 Saved: ${resultsPath}\n`);

    // Update grand totals
    grandTotalFixes += batchFixes;
    grandTotalReduction += batchReduction;
    grandSuccessfulFiles += batchSuccesses;
    allBatchResults.push(batchResultsData);

    return { batchFixes, batchReduction, batchSuccesses };
}

// Main execution
(async () => {
    console.log(`📋 Processing ${BATCHES_TO_RUN.length} batches (70 files total)\n`);
    console.log(`⏱️  Estimated time: 15-20 minutes\n`);

    for (const batchNum of BATCHES_TO_RUN) {
        await processBatch(batchNum);

        // Pause between batches
        if (batchNum < 10) {
            console.log('⏸️  Pausing 2 seconds before next batch...\n');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Grand summary
    const grandCascade = Math.round(grandTotalReduction * cascadeMultiplier);

    console.log('\n' + '═'.repeat(80));
    console.log('🎉 ALL BATCHES COMPLETE - GRAND SUMMARY');
    console.log('═'.repeat(80));
    console.log(`   📊 Batches Completed: 4-10 (7 batches)`);
    console.log(`   📁 Files Processed: 70`);
    console.log(`   ✅ Successful: ${grandSuccessfulFiles}/70 (${((grandSuccessfulFiles/70)*100).toFixed(1)}%)`);
    console.log(`   🎯 Total Fixes: ${grandTotalFixes}`);
    console.log(`   📉 Visible Reduction: ${grandTotalReduction}`);
    console.log(`   🔮 Cascade Reduction: ~${grandCascade}`);

    // Combined with Batches 1-3
    console.log('\n📈 COMBINED WITH BATCHES 1-3:');
    const batch1to3Fixes = 876; // 83 + 348 + 445
    const batch1to3Reduction = 395;
    const batch1to3Cascade = 727;

    const totalFixes = batch1to3Fixes + grandTotalFixes;
    const totalVisible = batch1to3Reduction + grandTotalReduction;
    const totalCascade = batch1to3Cascade + grandCascade;

    console.log(`   Combined Fixes: ${totalFixes} (${batch1to3Fixes} + ${grandTotalFixes})`);
    console.log(`   Combined Visible: ${totalVisible} (${batch1to3Reduction} + ${grandTotalReduction})`);
    console.log(`   Combined Cascade: ~${totalCascade} (${batch1to3Cascade} + ${grandCascade})`);
    console.log(`   Total Files: 100 (all processed)`);

    // Save combined results
    const combinedPath = path.join(__dirname, '../reports/phase90-batches4-10-combined.json');
    const combinedResults = {
        timestamp: new Date().toISOString(),
        batchRange: '4-10',
        filesProcessed: 70,
        successfulFiles: grandSuccessfulFiles,
        totalFixesApplied: grandTotalFixes,
        totalErrorReduction: grandTotalReduction,
        estimatedCascadeReduction: grandCascade,
        overallSuccessRate: ((grandSuccessfulFiles/70)*100).toFixed(1) + '%',
        batches: allBatchResults,
        combinedWithBatch1to3: {
            totalFixes,
            totalVisible,
            totalCascade,
            totalFiles: 100
        }
    };

    fs.writeFileSync(combinedPath, JSON.stringify(combinedResults, null, 2));
    console.log(`\n💾 Combined results saved: ${combinedPath}`);

    console.log('\n✅ PHASE 90 BATCHES 4-10 COMPLETE!\n');
})();
