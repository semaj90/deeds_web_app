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

    // Load pre-generated file list for Batch 15
    const batch15FilesPath = path.join(projectRoot, 'reports/phase90-batch15-files.json');

    if (!fs.existsSync(batch15FilesPath)) {
        console.error('❌ Error: phase90-batch15-files.json not found!');
        console.log('Run this command first:');
        console.log('npx tsc --noEmit 2>&1 | Select-String "^src/" | ForEach-Object { if ($_ -match "^(src/[^(]+)") { $matches[1] } } | Group-Object | Select-Object Name, Count | Sort-Object Count -Descending | Select-Object -Skip 305 -First 50 | ForEach-Object { [PSCustomObject]@{ File = $_.Name; Errors = $_.Count } } | ConvertTo-Json > reports/phase90-batch15-files.json');
        process.exit(1);
    }

    const batch15Files = JSON.parse(fs.readFileSync(batch15FilesPath, 'utf-8'));

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
