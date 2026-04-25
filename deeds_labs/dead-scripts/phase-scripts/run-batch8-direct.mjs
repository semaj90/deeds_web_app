#!/usr/bin/env node
/**
 * Direct execution wrapper for batch 8
 * Ensures output is visible
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { processFile } from './phase90-enhanced-ast-fixer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('╔════════════════════════════════════════════════════════════════════════════╗');
console.log('║             PHASE 90: batch 8 VALIDATION (Files 71-80)                    ║');
console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

// Load error files
const errorFilesPath = path.join(__dirname, '../reports/top-100-error-files.json');
const errorData = JSON.parse(fs.readFileSync(errorFilesPath, 'utf-8'));

// Get batch 8 files (indices 20-29)
const batch8Files = errorData.track1Files.slice(70, 80).map(f => ({
    path: f.file,
    errorCount: f.errorCount,
    strategy: f.strategy
}));

console.log(`✅ Loaded ${batch8Files.length} files for batch 8\n`);

let totalFixes = 0;
let totalErrorReduction = 0;
let successfulFiles = 0;
const results = [];

// Process each file
for (let i = 0; i < batch8Files.length; i++) {
    const fileInfo = batch8Files[i];
    const fileNum = 71 + i;

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📄 [${fileNum}/100] ${fileInfo.path}`);
    console.log(`   Errors before: ${fileInfo.errorCount}`);
    console.log(`   Strategy: ${fileInfo.strategy}`);

    try {
        const result = await processFile(fileInfo.path);
        results.push(result);

        if (result.success) {
            const reduction = result.errorsBefore - result.errorsAfter;
            totalFixes += result.fixesApplied || 0;
            totalErrorReduction += reduction;
            successfulFiles++;

            console.log(`   ✅ Success: ${result.fixesApplied} fixes, ${reduction} errors removed`);
            console.log(`   📊 Errors: ${result.errorsBefore} → ${result.errorsAfter}`);
        } else {
            console.log(`   ❌ Failed or rolled back`);
            if (result.rollback) {
                console.log(`   ⚠️  Rolled back: ${result.rollback.reason}`);
            }
        }
    } catch (error) {
        console.error(`   💥 Error: ${error.message}`);
        results.push({
            filePath: fileInfo.path,
            errorsBefore: fileInfo.errorCount,
            errorsAfter: fileInfo.errorCount,
            fixesApplied: 0,
            success: false,
            error: error.message
        });
    }

    // Pause between files
    await new Promise(resolve => setTimeout(resolve, 500));
}

// Calculate final statistics
const cascadeMultiplier = 1.84;
const estimatedCascade = Math.round(totalErrorReduction * cascadeMultiplier);

console.log(`\n${'═'.repeat(80)}`);
console.log('📊 batch 8 SUMMARY');
console.log(`${'═'.repeat(80)}`);
console.log(`   ✅ Successful files: ${successfulFiles}/10`);
console.log(`   🎯 Total fixes applied: ${totalFixes}`);
console.log(`   📉 Visible error reduction: ${totalErrorReduction}`);
console.log(`   🔮 Estimated cascade (1.84x): ~${estimatedCascade}`);
console.log(`   📈 Success rate: ${((successfulFiles / 10) * 100).toFixed(1)}%`);
console.log('');

// Save results
const resultsPath = path.join(__dirname, '../reports/phase90-batch8-enhanced-results.json');
const batchResults = {
    batchNumber: 3,
    timestamp: new Date().toISOString(),
    filesProcessed: 10,
    successfulFixes: successfulFiles,
    totalFixesApplied: totalFixes,
    totalErrorReduction: totalErrorReduction,
    cascadeMultiplier: cascadeMultiplier,
    estimatedCascadeReduction: estimatedCascade,
    successRate: ((successfulFiles / 10) * 100).toFixed(1) + '%',
    results: results
};

fs.writeFileSync(resultsPath, JSON.stringify(batchResults, null, 2));
console.log(`💾 Results saved: ${resultsPath}\n`);

// Compare with Batch 2
console.log('🔬 COMPARISON WITH BATCH 2:');
const batch2Path = path.join(__dirname, '../reports/phase90-batch2-enhanced-results.json');
if (fs.existsSync(batch2Path)) {
    const batch2Data = JSON.parse(fs.readFileSync(batch2Path, 'utf-8'));
    console.log(`   Batch 2: ${batch2Data.totalFixesApplied} fixes, ${batch2Data.totalErrorReduction} errors`);
    console.log(`   batch 8: ${totalFixes} fixes, ${totalErrorReduction} errors`);

    const fixDiff = ((totalFixes / batch2Data.totalFixesApplied - 1) * 100).toFixed(1);
    const errorDiff = ((totalErrorReduction / batch2Data.totalErrorReduction - 1) * 100).toFixed(1);
    console.log(`   Performance: ${fixDiff > 0 ? '+' : ''}${fixDiff}% fixes, ${errorDiff > 0 ? '+' : ''}${errorDiff}% errors`);
} else {
    console.log(`   ⚠️  Batch 2 results not found for comparison`);
}

console.log('\n✅ batch 8 complete!\n');

