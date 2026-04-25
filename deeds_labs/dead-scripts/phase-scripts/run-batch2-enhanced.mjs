#!/usr/bin/env node
/**
 * Phase 90 Enhanced: Batch 2 Executor
 *
 * Runs enhanced AST fixer on files 11-20 from top-100-error-files.json
 * Compares performance against base fixer results from Batch 1
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

const errorFilesPath = path.join(__dirname, '../reports/top-100-error-files.json');
const outputPath = path.join(__dirname, '../reports/phase90-batch2-enhanced-results.json');

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log('🚀 Phase 90 Enhanced: Batch 2 (Files 11-20)\n');
    console.log('══════════════════════════════════════════════════════════════════════');

    // Load error files
    const errorFilesData = JSON.parse(fs.readFileSync(errorFilesPath, 'utf-8'));
    const errorFiles = errorFilesData.track1Files || [];

    // Extract Batch 2 (files 11-20)
    const batch2 = errorFiles.slice(10, 20).map((f) => ({
        path: f.file,
        errorCount: f.errorCount,
        strategy: f.strategy,
    }));

    console.log(`\n📂 Processing ${batch2.length} files:\n`);
    batch2.forEach((f, i) => {
        console.log(`   ${i + 1}. ${path.basename(f.path)} (${f.errorCount} errors)`);
    });

    console.log('\n');

    // Process each file
    const results = [];

    for (const fileInfo of batch2) {
        const result = await processFile(fileInfo.path);
        results.push(result);

        // Show result immediately
        const statusIcon = result.success ? '✅' : '❌';
        console.log(
            `${statusIcon} ${path.basename(result.filePath)}: ${result.fixesApplied} fixes, ${result.errorsBefore} → ${result.errorsAfter} errors\n`
        );
    }

    // Calculate summary statistics
    const successful = results.filter((r) => r.success);
    const totalFixesApplied = successful.reduce((sum, r) => sum + r.fixesApplied, 0);
    const totalErrorReduction = successful.reduce(
        (sum, r) => sum + (r.errorsBefore - r.errorsAfter),
        0
    );
    const cascadeProjection = Math.round(totalErrorReduction * 1.84);

    // Save results
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    // Display summary
    console.log('📊 Batch 2 Enhanced Summary:');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`  ✅ Successful: ${successful.length}/${batch2.length}`);
    console.log(`  🎯 Total fixes: ${totalFixesApplied}`);
    console.log(`  📉 Total error reduction: ${totalErrorReduction}`);
    console.log(`  🔮 Projected with 1.84x cascade: ~${cascadeProjection}`);
    console.log('');
    console.log(`💾 Results saved: ${outputPath}`);
    console.log('');

    // Compare with Batch 1 base fixer results
    const batch1ResultsPath = path.join(__dirname, '../reports/phase90-batch1-results.json');
    if (fs.existsSync(batch1ResultsPath)) {
        const batch1Results = JSON.parse(fs.readFileSync(batch1ResultsPath, 'utf-8'));
        const batch1Successful = batch1Results.filter((r) => r.success);
        const batch1Fixes = batch1Successful.reduce((sum, r) => sum + r.fixesApplied, 0);
        const batch1Reduction = batch1Successful.reduce(
            (sum, r) => sum + (r.errorsBefore - r.errorsAfter),
            0
        );

        console.log('📊 Comparison: Enhanced vs. Base Fixer');
        console.log('══════════════════════════════════════════════════════════════════════');
        console.log(
            `  Success rate: ${successful.length}/10 enhanced vs. ${batch1Successful.length}/10 base`
        );
        console.log(`  Total fixes: ${totalFixesApplied} enhanced vs. ${batch1Fixes} base`);
        console.log(
            `  Error reduction: ${totalErrorReduction} enhanced vs. ${batch1Reduction} base`
        );

        if (totalFixesApplied > batch1Fixes) {
            const improvement = ((totalFixesApplied / batch1Fixes - 1) * 100).toFixed(1);
            console.log(`  🚀 Improvement: +${improvement}% more fixes with enhanced fixer`);
        }

        console.log('');
    }

    console.log('✅ Batch 2 complete!');
}

main().catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
});
