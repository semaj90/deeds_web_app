#!/usr/bin/env node
/**
 * Phase 90 Batch 13: Next 50 Files (Ranks 206-255 by error count)
 * Building on Batches 1-12 success (3,397 fixes, 66% average success rate)
 * Targeting files with 136-369 errors each
 *
 * Expected Impact:
 * - Files: 50
 * - Estimated fixes: ~600-1,000
 * - Estimated success rate: 65-70% (accounting for higher complexity)
 * - Cascade multiplier: 1.84x (validated)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Change to project root
const projectRoot = path.join(__dirname, '..');
process.chdir(projectRoot);

// Dynamic import after path change
import('./phase90-enhanced-ast-fixer.mjs').then(async (module) => {
    const { processFile } = module;

    // Next 50 highest-error files (ranks 206-255)
    const BATCH13_FILES = [
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
        'src/lib/machines/vectorJobMachine.ts',                     // 141 errors
        'src/lib/server/context/contextual.ts',                     // 141 errors
        'src/lib/server/services/search/elasticsearch-search.ts',   // 141 errors
        'src/lib/database/migrations/migration-system.ts',          // 139 errors
        'src/lib/server/ai/qdrant-vector-store.ts',                 // 136 errors
        'src/lib/server/workers/legal-ai-worker.ts'                 // 134 errors
    ];

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

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║              Phase 90 Batch 13: 50 High-Error Files           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 Processing ${BATCH13_FILES.length} files...\n`);

    for (const relPath of BATCH13_FILES) {
        const absPath = path.join(projectRoot, relPath);
        console.log(`\n📄 Processing: ${relPath}`);

        try {
            const result = await processFile(absPath);

            results.filesProcessed++;
            results.totalFixes += result.fixesApplied || 0;

            if (result.rolledBack) {
                results.rollbacks.push(relPath);
                results.failed++;
                console.log(`   ⚠️  ROLLED BACK (errors increased by ${result.errorDelta || 0})`);
            } else if (result.fixesApplied > 0) {
                results.successful++;
                results.visibleErrorReduction += (result.errorDelta || 0);
                console.log(`   ✅ Success: ${result.fixesApplied} fixes, ${result.errorDelta} error delta`);
            } else {
                results.failed++;
                console.log(`   ⏭️  Skipped: No applicable patterns found`);
            }

            results.fileResults.push({
                file: relPath,
                ...result
            });

        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
            results.failed++;
            results.fileResults.push({
                file: relPath,
                error: error.message
            });
        }

        // Small delay between files
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Calculate cascade
    results.estimatedCascade = Math.round(results.visibleErrorReduction * 1.84);

    // Final summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                 BATCH 13 COMPLETE - SUMMARY                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 Files Processed: ${results.filesProcessed}/${BATCH13_FILES.length}`);
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

    // Save results
    await fs.promises.writeFile(
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

}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
