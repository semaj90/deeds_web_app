#!/usr/bin/env node
/**
 * Phase 90: Batch Runner for Files 21-100 (Batches 3-10)
 *
 * Processes remaining 80 files from top-100-error-files.json using enhanced
 * AST fixer with Redis KAG patterns.
 *
 * Expected Impact:
 * - Conservative: 348 fixes/batch × 8 = ~2,784 fixes
 * - Error reduction: 177 visible/batch × 8 = ~1,416 errors
 * - Cascade: ~2,605 total errors removed (1.84x multiplier)
 *
 * Usage:
 *   node run-batches-3-10.mjs                    # Process all batches
 *   node run-batches-3-10.mjs --batch 3          # Process single batch
 *   node run-batches-3-10.mjs --start 3 --end 5  # Process batches 3-5
 *   node run-batches-3-10.mjs --dry-run          # Simulate without changes
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { processFile } from './phase90-enhanced-ast-fixer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const BATCH_SIZE = 10;
const TOTAL_BATCHES = 10;
const ERROR_FILES_PATH = path.join(__dirname, '../reports/top-100-error-files.json');
const RESULTS_DIR = path.join(__dirname, '../reports');

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Process a single batch
 */
async function processBatch(batchNumber, files, dryRun = false) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 BATCH ${batchNumber} - Processing ${files.length} files`);
    console.log(`${'='.repeat(80)}\n`);

    const results = [];
    let totalFixes = 0;
    let totalErrorReduction = 0;
    let successfulFiles = 0;

    for (let i = 0; i < files.length; i++) {
        const fileInfo = files[i];
        const fileNum = (batchNumber - 1) * BATCH_SIZE + i + 1;

        console.log(`\n📄 [${fileNum}/${TOTAL_BATCHES * BATCH_SIZE}] ${fileInfo.path}`);
        console.log(`   Errors before: ${fileInfo.errorCount}`);
        console.log(`   Strategy: ${fileInfo.strategy}`);

        if (dryRun) {
            console.log(`   🌵 DRY RUN - Skipping actual processing`);
            results.push({
                filePath: fileInfo.path,
                errorsBefore: fileInfo.errorCount,
                errorsAfter: fileInfo.errorCount,
                fixesApplied: 0,
                success: false,
                dryRun: true,
            });
            continue;
        }

        try {
            const result = await processFile(fileInfo.path);

            results.push(result);

            if (result.success) {
                const reduction = result.errorsBefore - result.errorsAfter;
                totalFixes += result.fixesApplied || 0;
                totalErrorReduction += reduction;
                successfulFiles++;

                console.log(`   ✅ Success: ${result.fixesApplied} fixes, ${reduction} errors removed`);
            } else {
                console.log(`   ❌ Failed or rolled back`);
            }
        } catch (error) {
            console.error(`   💥 Error processing file: ${error.message}`);
            results.push({
                filePath: fileInfo.path,
                errorsBefore: fileInfo.errorCount,
                errorsAfter: fileInfo.errorCount,
                fixesApplied: 0,
                success: false,
                error: error.message,
            });
        }

        // Brief pause between files to avoid overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Calculate batch statistics
    const cascadeMultiplier = 1.84;
    const projectedCascade = Math.round(totalErrorReduction * cascadeMultiplier);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Batch ${batchNumber} Summary:`);
    console.log(`${'='.repeat(80)}`);
    console.log(`   ✅ Successful: ${successfulFiles}/${files.length}`);
    console.log(`   🎯 Total fixes: ${totalFixes}`);
    console.log(`   📉 Total error reduction: ${totalErrorReduction}`);
    console.log(`   🔮 Projected with 1.84x cascade: ~${projectedCascade}`);
    console.log('');

    return {
        batchNumber,
        files: files.length,
        successfulFiles,
        totalFixes,
        totalErrorReduction,
        projectedCascade,
        results,
    };
}

/**
 * Load files for specific batch number
 */
function loadBatchFiles(batchNumber) {
    const errorFilesData = JSON.parse(fs.readFileSync(ERROR_FILES_PATH, 'utf-8'));
    const errorFiles = errorFilesData.track1Files || [];

    const startIdx = (batchNumber - 1) * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, errorFiles.length);

    return errorFiles.slice(startIdx, endIdx).map((f) => ({
        path: f.file,
        errorCount: f.errorCount,
        strategy: f.strategy,
    }));
}

/**
 * Process multiple batches
 */
async function processBatches(startBatch, endBatch, dryRun = false) {
    console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                   PHASE 90: BATCH RUNNER (ENHANCED)                        ║
║                                                                            ║
║  Processing batches ${startBatch}-${endBatch} (${(endBatch - startBatch + 1) * BATCH_SIZE} files)                                      ║
║                                                                            ║
║  Enhanced Features:                                                        ║
║  • 14 Redis KAG knowledge patterns                                         ║
║  • Confidence threshold system (70% default)                               ║
║  • Fix metadata tracking                                                   ║
║  • Automatic rollback on regression                                        ║
║                                                                            ║
${dryRun ? '║  🌵 DRY RUN MODE - No changes will be made                             ║' : ''}
╚════════════════════════════════════════════════════════════════════════════╝
    `);

    const allResults = [];
    let grandTotalFixes = 0;
    let grandTotalReduction = 0;
    let grandSuccessfulFiles = 0;

    for (let batchNum = startBatch; batchNum <= endBatch; batchNum++) {
        const files = loadBatchFiles(batchNum);

        if (files.length === 0) {
            console.log(`\n⚠️  Batch ${batchNum}: No files found`);
            continue;
        }

        const batchResult = await processBatch(batchNum, files, dryRun);

        allResults.push(batchResult);
        grandTotalFixes += batchResult.totalFixes;
        grandTotalReduction += batchResult.totalErrorReduction;
        grandSuccessfulFiles += batchResult.successfulFiles;

        // Save individual batch results
        if (!dryRun) {
            const resultsPath = path.join(RESULTS_DIR, `phase90-batch${batchNum}-enhanced-results.json`);
            fs.writeFileSync(resultsPath, JSON.stringify(batchResult, null, 2));
            console.log(`💾 Results saved: ${resultsPath}\n`);
        }

        // Brief pause between batches
        if (batchNum < endBatch) {
            console.log(`\n⏸️  Pausing 2 seconds before next batch...\n`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    // Grand summary
    const totalFiles = (endBatch - startBatch + 1) * BATCH_SIZE;
    const cascadeMultiplier = 1.84;
    const grandProjectedCascade = Math.round(grandTotalReduction * cascadeMultiplier);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎯 GRAND SUMMARY (Batches ${startBatch}-${endBatch})`);
    console.log(`${'='.repeat(80)}`);
    console.log(`   Files processed: ${totalFiles}`);
    console.log(`   ✅ Successful: ${grandSuccessfulFiles}/${totalFiles} (${((grandSuccessfulFiles / totalFiles) * 100).toFixed(1)}%)`);
    console.log(`   🎯 Total fixes: ${grandTotalFixes}`);
    console.log(`   📉 Total error reduction: ${grandTotalReduction}`);
    console.log(`   🔮 Projected with 1.84x cascade: ~${grandProjectedCascade}`);
    console.log('');

    // Combined with previous batches (1-2)
    const batch1Fixes = 83;
    const batch1Reduction = 113;
    const batch2Fixes = 348;
    const batch2Reduction = 177;

    const combinedFixes = batch1Fixes + batch2Fixes + grandTotalFixes;
    const combinedReduction = batch1Reduction + batch2Reduction + grandTotalReduction;
    const combinedCascade = Math.round(combinedReduction * cascadeMultiplier);

    console.log(`📊 COMBINED IMPACT (Batches 1-${endBatch}):`);
    console.log(`   Total fixes: ${combinedFixes}`);
    console.log(`   Total error reduction: ${combinedReduction} visible`);
    console.log(`   Total cascade: ~${combinedCascade} errors`);
    console.log(`${'='.repeat(80)}\n`);

    // Save combined results
    if (!dryRun) {
        const combinedPath = path.join(RESULTS_DIR, `phase90-batches${startBatch}-${endBatch}-combined.json`);
        fs.writeFileSync(
            combinedPath,
            JSON.stringify(
                {
                    batches: allResults,
                    summary: {
                        filesProcessed: totalFiles,
                        successfulFiles: grandSuccessfulFiles,
                        totalFixes: grandTotalFixes,
                        totalErrorReduction: grandTotalReduction,
                        projectedCascade: grandProjectedCascade,
                        combinedWithBatches1_2: {
                            totalFixes: combinedFixes,
                            totalReduction: combinedReduction,
                            totalCascade: combinedCascade,
                        },
                    },
                },
                null,
                2
            )
        );
        console.log(`💾 Combined results saved: ${combinedPath}\n`);
    }

    return {
        batches: allResults,
        totalFixes: grandTotalFixes,
        totalErrorReduction: grandTotalReduction,
        projectedCascade: grandProjectedCascade,
    };
}

// ============================================================================
// MAIN (CLI)
// ============================================================================

async function main() {
    const args = process.argv.slice(2);

    // Parse command line arguments
    const dryRun = args.includes('--dry-run');
    const batchArg = args.indexOf('--batch');
    const startArg = args.indexOf('--start');
    const endArg = args.indexOf('--end');

    let startBatch = 3;
    let endBatch = 10;

    if (batchArg !== -1) {
        // Single batch mode
        const batchNum = parseInt(args[batchArg + 1]);
        if (isNaN(batchNum) || batchNum < 1 || batchNum > TOTAL_BATCHES) {
            console.error(`❌ Invalid batch number: ${args[batchArg + 1]}`);
            console.error(`   Must be between 1 and ${TOTAL_BATCHES}`);
            process.exit(1);
        }
        startBatch = batchNum;
        endBatch = batchNum;
    } else {
        // Range mode
        if (startArg !== -1) {
            startBatch = parseInt(args[startArg + 1]);
        }
        if (endArg !== -1) {
            endBatch = parseInt(args[endArg + 1]);
        }

        if (isNaN(startBatch) || isNaN(endBatch) || startBatch > endBatch) {
            console.error(`❌ Invalid batch range: ${startBatch}-${endBatch}`);
            process.exit(1);
        }
    }

    try {
        await processBatches(startBatch, endBatch, dryRun);
        console.log('✅ Batch processing complete!\n');
        process.exit(0);
    } catch (error) {
        console.error(`\n💥 Fatal error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
