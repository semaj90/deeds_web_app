#!/usr/bin/env node
/**
 * Phase 90 Batch 13: Next 50 Files (Ranks 206-255 by error count)
 * Building on Batches 1-12 success (3,397 fixes, 66% average success rate)
 *
 * NEW: Using complexity pre-filter to route files intelligently
 * - Auto-batch: <25 complexity score
 * - Slow-batch: 25-50 complexity score
 * - Manual-review: >50 complexity score (skip for now)
 *
 * Expected: ~400-600 fixes based on error density
 * Target: 65-70% success rate (accounting for higher complexity in remaining files)
 */

import fs from 'fs/promises';
import path from 'path';
import { analyzeComplexity } from './complexity-pre-filter.mjs';

const projectRoot = path.resolve(process.cwd());

// Next 50 highest-error files (from error analysis)
const BATCH13_CANDIDATES = [
    'src/lib/server/adapters/service-integrations.ts',          // 369 errors
    'src/lib/services/cognitive-cache-integration.ts',          // 317 errors
    'src/lib/server/storage/minio-service.ts',                  // 298 errors
    'src/lib/server/ai/enhanced-orchestrator.ts',               // 286 errors
    'src/lib/services/ace-web/minio-service.ts',                // 280 errors
    'src/lib/services/advanced-evidence-analyzer.ts',           // 261 errors
    'src/lib/machines/aiAssistantMachine.ts',                   // 256 errors
    'src/lib/services/webgpu-simd-accelerator.ts',              // 256 errors
    'src/lib/workers/recursive-evidence-chain-worker.ts',       // 251 errors
    'src/lib/cache/parallel-cache-orchestrator.ts',             // 244 errors
    'src/lib/machines/recommendation-routing-machine.ts',       // 244 errors
    'src/lib/services/ai-evidence-analyzer.ts',                 // 240 errors
    'src/lib/services/error-analysis/JSONLStorage.ts',          // 240 errors
    'src/lib/server/ai/rag-pipeline.ts',                        // 240 errors
    'src/lib/services/ollama-service.ts',                       // 240 errors
    'src/lib/services/error-analysis/ErrorClustering.ts',       // 230 errors
    'src/lib/services/ace-web/ace-context-service.ts',          // 214 errors
    'src/lib/cache/glyph-shader-cache-bridge.ts',               // 212 errors
    'src/lib/services/knowledge-search/KnowledgeIndexer.ts',    // 212 errors
    'src/lib/services/gpu-cache-rpc-client.ts',                 // 211 errors
    'src/lib/ui/matrix-compiler.ts',                            // 194 errors
    'src/lib/utils/simd-markdown-parser.ts',                    // 194 errors
    'src/lib/middleware/binary-encoding.ts',                    // 191 errors
    'src/lib/services/kag-fix-store.ts',                        // 191 errors
    'src/lib/state/legal-form-machines.ts',                     // 190 errors
    'src/lib/stores/machines/aiProcessingMachine.ts',           // 186 errors
    'src/lib/workers/webgpu-cuda-bridge.ts',                    // 185 errors
    'src/lib/state/documentUploadMachine.ts',                   // 183 errors
    'src/lib/workers/legal-ai-worker-pool.ts',                  // 181 errors
    'src/lib/config/production.ts',                             // 176 errors
    'src/lib/services/error-analysis/knowledge-base-learning.ts', // 173 errors
    'src/lib/services/nes-cache-orchestrator.ts',               // 168 errors
    'src/lib/server/ai/contextual-understanding-service.ts',    // 165 errors
    'src/lib/server/storage/minio.ts',                          // 162 errors
    'src/lib/machines/ingestion-workflow-machine.ts',           // 160 errors
    'src/lib/server/message-queue.ts',                          // 158 errors
    'src/lib/server/ai/hmm-state-machine.ts',                   // 157 errors
    'src/lib/routing/unified-api-router.ts',                    // 155 errors
    'src/lib/services/llm-router.ts',                           // 155 errors
    'src/lib/server/search/loki.ts',                            // 155 errors
    'src/lib/server/error-brain/knowledge-base.ts',             // 148 errors
    'src/lib/services/enhanced-rag-self-organizing.ts',         // 148 errors
    'src/lib/text/utf8-fp32-converter.ts',                      // 143 errors
    'src/lib/services/rag-codebase.ts',                         // 142 errors
    'src/lib/services/unified-document-processor.ts',           // 142 errors (already in Batch 12, may have been fixed)
    'src/lib/machines/vectorJobMachine.ts',                     // 141 errors
    'src/lib/server/context/contextual.ts',                     // 141 errors
    'src/lib/server/services/search/elasticsearch-search.ts',   // 141 errors
    'src/lib/database/migrations/migration-system.ts',          // 139 errors
    'src/lib/server/ai/qdrant-vector-store.ts'                  // 136 errors
];

async function runBatch13() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           Phase 90 Batch 13: Complexity-Filtered Batch        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Step 1: Analyze complexity for all candidates
    console.log('🔍 Step 1: Analyzing complexity for 50 candidate files...\n');
    const complexityResults = [];

    for (const relPath of BATCH13_CANDIDATES) {
        const absPath = path.join(projectRoot, relPath);
        try {
            const result = await analyzeComplexity(absPath);
            complexityResults.push(result);
            console.log(`   ${path.basename(relPath).padEnd(50)} | Score: ${result.score.toString().padStart(5)} | ${result.recommendation}`);
        } catch (error) {
            console.log(`   ${path.basename(relPath).padEnd(50)} | ERROR: ${error.message}`);
        }
    }

    // Step 2: Categorize by recommendation
    const autoBatch = complexityResults.filter(r => r.recommendation === 'auto-batch');
    const slowBatch = complexityResults.filter(r => r.recommendation === 'slow-batch');
    const manualReview = complexityResults.filter(r => r.recommendation === 'manual-review');

    console.log('\n📊 Complexity Analysis Summary:\n');
    console.log(`   Auto-batch (<25):    ${autoBatch.length} files`);
    console.log(`   Slow-batch (25-50):  ${slowBatch.length} files`);
    console.log(`   Manual-review (>50): ${manualReview.length} files\n`);

    // Save complexity analysis
    await fs.writeFile(
        'reports/phase90-batch13-complexity-analysis.json',
        JSON.stringify({ autoBatch, slowBatch, manualReview }, null, 2)
    );

    // Step 3: Process auto-batch files first (highest success probability)
    console.log('═'.repeat(66));
    console.log('🚀 Step 2: Processing auto-batch files (high confidence)...\n');

    const results = {
        batch: 13,
        timestamp: new Date().toISOString(),
        filesProcessed: 0,
        successful: 0,
        failed: 0,
        totalFixes: 0,
        visibleErrorReduction: 0,
        estimatedCascade: 0,
        fileResults: [],
        rollbacks: []
    };

    // Process auto-batch files
    for (const complexityResult of autoBatch) {
        const relPath = path.relative(projectRoot, complexityResult.filePath);
        console.log(`\n📄 Processing: ${relPath}`);
        console.log(`   Complexity: ${complexityResult.score} (${complexityResult.recommendation})`);

        try {
            const fixResult = await processFile(complexityResult.filePath);

            results.filesProcessed++;
            results.totalFixes += fixResult.fixesApplied || 0;

            if (fixResult.rolledBack) {
                results.rollbacks.push(relPath);
                results.failed++;
                console.log(`   ⚠️  ROLLED BACK (errors increased)`);
            } else if (fixResult.fixesApplied > 0) {
                results.successful++;
                results.visibleErrorReduction += (fixResult.errorDelta || 0);
                console.log(`   ✅ Success: ${fixResult.fixesApplied} fixes applied`);
            } else {
                results.failed++;
                console.log(`   ⏭️  Skipped: No fixes applied`);
            }

            results.fileResults.push({
                file: relPath,
                complexity: complexityResult.score,
                category: 'auto-batch',
                ...fixResult
            });

        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
            results.failed++;
            results.fileResults.push({
                file: relPath,
                complexity: complexityResult.score,
                category: 'auto-batch',
                error: error.message
            });
        }

        // Small delay between files
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Step 4: Process slow-batch files (medium confidence, conservative approach)
    if (slowBatch.length > 0) {
        console.log('\n═'.repeat(66));
        console.log('⚡ Step 3: Processing slow-batch files (conservative mode)...\n');

        for (const complexityResult of slowBatch) {
            const relPath = path.relative(projectRoot, complexityResult.filePath);
            console.log(`\n📄 Processing: ${relPath}`);
            console.log(`   Complexity: ${complexityResult.score} (${complexityResult.recommendation})`);
            console.log(`   Reasons: ${complexityResult.reasons.join(', ')}`);

            try {
                // For slow-batch, we might add additional safety checks or skip risky patterns
                const fixResult = await processFile(complexityResult.filePath);

                results.filesProcessed++;
                results.totalFixes += fixResult.fixesApplied || 0;

                if (fixResult.rolledBack) {
                    results.rollbacks.push(relPath);
                    results.failed++;
                    console.log(`   ⚠️  ROLLED BACK (errors increased)`);
                } else if (fixResult.fixesApplied > 0) {
                    results.successful++;
                    results.visibleErrorReduction += (fixResult.errorDelta || 0);
                    console.log(`   ✅ Success: ${fixResult.fixesApplied} fixes applied`);
                } else {
                    results.failed++;
                    console.log(`   ⏭️  Skipped: No fixes applied`);
                }

                results.fileResults.push({
                    file: relPath,
                    complexity: complexityResult.score,
                    category: 'slow-batch',
                    ...fixResult
                });

            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
                results.failed++;
                results.fileResults.push({
                    file: relPath,
                    complexity: complexityResult.score,
                    category: 'slow-batch',
                    error: error.message
                });
            }

            await new Promise(resolve => setTimeout(resolve, 1000)); // Longer delay for slow-batch
        }
    }

    // Calculate cascade
    results.estimatedCascade = Math.round(results.visibleErrorReduction * 1.84);

    // Final summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                  BATCH 13 COMPLETE - SUMMARY                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 Files Processed: ${results.filesProcessed}/${BATCH13_CANDIDATES.length}`);
    console.log(`✅ Successful: ${results.successful}/${results.filesProcessed} (${(results.successful/results.filesProcessed*100).toFixed(1)}%)`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⚠️  Rollbacks: ${results.rollbacks.length}`);
    console.log(`🎯 Total Fixes: ${results.totalFixes}`);
    console.log(`📉 Visible Reduction: ${results.visibleErrorReduction}`);
    console.log(`🔮 Estimated Cascade: ~${results.estimatedCascade}`);
    console.log(`📈 Success Rate: ${(results.successful/results.filesProcessed*100).toFixed(1)}%\n`);

    if (results.rollbacks.length > 0) {
        console.log('⚠️  Rolled Back Files:');
        results.rollbacks.forEach(file => console.log(`   • ${file}`));
        console.log();
    }

    // Manual review files
    if (manualReview.length > 0) {
        console.log('📋 Manual Review Recommended:');
        manualReview.forEach(r => {
            console.log(`   • ${path.basename(r.filePath)} (score: ${r.score})`);
            console.log(`     ${r.reasons.join(', ')}`);
        });
        console.log();
    }

    // Save results
    await fs.writeFile(
        'reports/phase90-batch13-results.json',
        JSON.stringify(results, null, 2)
    );
    console.log('💾 Results saved: reports/phase90-batch13-results.json\n');

    // Cumulative stats (batches 1-13)
    const previousFixes = 3397; // From batches 1-12
    const previousFiles = 205;
    const cumulativeFixes = previousFixes + results.totalFixes;
    const cumulativeFiles = previousFiles + results.filesProcessed;

    console.log('📈 CUMULATIVE STATS (Batches 1-13):');
    console.log(`   Total Files: ${cumulativeFiles}`);
    console.log(`   Total Fixes: ${cumulativeFixes}`);
    console.log(`   Total Visible: ${-714 + results.visibleErrorReduction}`);
    console.log(`   Total Cascade: ~${-1313 + results.estimatedCascade}\n`);

    console.log('✅ BATCH 13 COMPLETE!\n');

    return results;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runBatch13().catch(console.error);
}

export { runBatch13 };
