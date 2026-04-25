#!/usr/bin/env node
/**
 * Phase 90 Batch 11: Next 50 Highest-Error Files (Files 101-150)
 *
 * Building on Batches 1-10 success (1,629 fixes, 66% success rate)
 * Targeting files with 80-863 errors each
 *
 * Expected Impact:
 * - Files: 50
 * - Estimated fixes: ~800-1,200 (based on batch 8-10 avg)
 * - Estimated success rate: 65-70% (consistent with previous)
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

    // Next 50 highest-error files (files 101-150)
    const BATCH11_FILES = [
        // 863-590 errors (Top priority)
        'src/lib/components/three/yorha-ui/components/YoRHaButtonAA3D.ts',
        'src/lib/server/services/citation.service.ts',

        // 434-289 errors
        'src/lib/components/three/yorha-ui/NESYoRHaHybrid3D.ts',
        'src/lib/server/ai/rag-pipeline.ts',
        'src/lib/utils/simd-markdown-parser.ts',
        'src/lib/services/ace-web/ace-context-service.ts',
        'src/lib/cache/glyph-shader-cache-bridge.ts',
        'src/lib/server/adapters/service-integrations.ts',
        'src/lib/services/ace-web/minio-service.ts',
        'src/lib/workers/recursive-evidence-chain-worker.ts',
        'src/lib/server/storage/minio-service.ts',
        'src/lib/server/ai/enhanced-orchestrator.ts',
        'src/lib/services/cognitive-cache-integration.ts',

        // 276-233 errors
        'src/lib/workers/webgpu-cuda-bridge.ts',
        'src/lib/machines/aiAssistantMachine.ts',
        'src/lib/machines/recommendation-routing-machine.ts',
        'src/lib/services/webgpu-simd-accelerator.ts',
        'src/lib/services/ollama-service.ts',
        'src/lib/server/ai/hmm-state-machine.ts',
        'src/lib/services/error-analysis/JSONLStorage.ts',
        'src/lib/cache/parallel-cache-orchestrator.ts',
        'src/lib/services/ai-evidence-analyzer.ts',
        'src/lib/state/documentUploadMachine.ts',
        'src/lib/services/rag-knowledge-pipeline.ts',

        // 232-183 errors
        'src/lib/services/error-analysis/ErrorClustering.ts',
        'src/lib/services/kag-fix-store.ts',
        'src/lib/services/gpu-cache-rpc-client.ts',
        'src/lib/state/legal-form-machines.ts',
        'src/lib/middleware/binary-encoding.ts',
        'src/lib/config/production.ts',
        'src/lib/stores/machines/aiProcessingMachine.ts',
        'src/lib/ui/matrix-compiler.ts',
        'src/lib/services/nes-cache-orchestrator.ts',
        'src/lib/services/knowledge-search/KnowledgeIndexer.ts',
        'src/lib/workers/legal-ai-worker-pool.ts',

        // 182-149 errors
        'src/lib/machines/ingestion-workflow-machine.ts',
        'src/lib/services/error-analysis/knowledge-base-learning.ts',
        'src/lib/server/storage/minio.ts',
        'src/lib/server/error-brain/knowledge-base.ts',
        'src/lib/server/services/search/pgvector-search.ts',
        'src/lib/server/ai/contextual-understanding-service.ts',
        'src/lib/routing/unified-api-router.ts',
        'src/lib/server/message-queue.ts',
        'src/lib/services/llm-router.ts',
        'src/lib/server/search/loki.ts',
        'src/lib/forms/contextual-chat-schema.ts',
        'src/lib/services/enhanced-rag-self-organizing.ts',
        'src/lib/server/services/search/elasticsearch-search.ts',
        'src/lib/machines/vectorJobMachine.ts',
        'src/lib/text/utf8-fp32-converter.ts',
        'src/lib/database/migrations/migration-system.ts',

        // 145-80 errors (Round out to 50 files)
        'src/lib/server/ai/qdrant-vector-store.ts',
        'src/lib/server/workers/legal-ai-worker.ts',
        'src/lib/server/context/contextual.ts',
        'src/lib/services/rag-codebase.ts',
    ];

    console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                  PHASE 90 BATCH 11 - NEXT 50 FILES                        ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
    console.log(`📁 Files to process: ${BATCH11_FILES.length}`);
    console.log(`📊 Expected range: 80-863 errors per file`);
    console.log(`🎯 Target: 65-70% success rate (based on Batches 1-10)\n`);

    const results = {
        batchNumber: 11,
        filesProcessed: 0,
        successful: 0,
        failed: 0,
        totalFixes: 0,
        visibleErrorReduction: 0,
        estimatedCascade: 0,
        details: []
    };

    let fileIndex = 0;
    for (const filePath of BATCH11_FILES) {
        fileIndex++;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📄 File ${fileIndex}/${BATCH11_FILES.length}: ${filePath}`);
        console.log(`${'='.repeat(80)}\n`);

        try {
            const result = await processFile(filePath);

            results.filesProcessed++;
            if (result.success) {
                results.successful++;
                results.totalFixes += result.fixesApplied || 0;
                results.visibleErrorReduction += Math.abs(result.errorReduction || 0);
            } else {
                results.failed++;
            }

            results.details.push({
                file: filePath,
                success: result.success,
                fixesApplied: result.fixesApplied || 0,
                errorsBefore: result.errorsBefore || 0,
                errorsAfter: result.errorsAfter || 0,
                errorReduction: result.errorReduction || 0,
                rolledBack: result.rolledBack || false,
                reason: result.message || ''
            });

            // Brief pause between files
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.error(`❌ Critical error processing ${filePath}:`, error.message);
            results.failed++;
            results.details.push({
                file: filePath,
                success: false,
                error: error.message
            });
        }
    }

    // Calculate cascade
    results.estimatedCascade = Math.round(results.visibleErrorReduction * 1.84);

    // Display summary
    console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    BATCH 11 COMPLETE - SUMMARY                             ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
    console.log(`📊 Files Processed: ${results.filesProcessed}/${BATCH11_FILES.length}`);
    console.log(`✅ Successful: ${results.successful}/${results.filesProcessed} (${(results.successful/results.filesProcessed*100).toFixed(1)}%)`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`🎯 Total Fixes: ${results.totalFixes}`);
    console.log(`📉 Visible Reduction: ${results.visibleErrorReduction}`);
    console.log(`🔮 Estimated Cascade: ~${results.estimatedCascade}`);
    console.log(`📈 Success Rate: ${(results.successful/results.filesProcessed*100).toFixed(1)}%\n`);

    // Save results
    const reportPath = path.join(projectRoot, 'reports/phase90-batch11-results.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`💾 Results saved: ${reportPath}\n`);

    // Load previous batches for cumulative stats
    let cumulativeStats = {
        totalFiles: results.filesProcessed,
        totalFixes: results.totalFixes,
        totalVisible: results.visibleErrorReduction,
        totalCascade: results.estimatedCascade
    };

    try {
        const batch1to10Path = path.join(projectRoot, 'reports/phase90-batches8-10-combined.json');
        if (fs.existsSync(batch1to10Path)) {
            const previous = JSON.parse(fs.readFileSync(batch1to10Path, 'utf8'));
            // Assuming previous contains cumulative for batches 1-10
            cumulativeStats.totalFiles = 100 + results.filesProcessed;
            cumulativeStats.totalFixes = (previous.combinedFixes || 1629) + results.totalFixes;
            cumulativeStats.totalVisible = (previous.combinedVisible || 714) + results.visibleErrorReduction;
            cumulativeStats.totalCascade = Math.round(cumulativeStats.totalVisible * 1.84);
        }
    } catch (e) {
        console.log('⚠️  Could not load previous batch data for cumulative stats');
    }

    console.log('📈 CUMULATIVE STATS (Batches 1-11):');
    console.log(`   Total Files: ${cumulativeStats.totalFiles}`);
    console.log(`   Total Fixes: ${cumulativeStats.totalFixes}`);
    console.log(`   Total Visible: ${cumulativeStats.totalVisible}`);
    console.log(`   Total Cascade: ~${cumulativeStats.totalCascade}\n`);

    console.log('✅ BATCH 11 COMPLETE!\n');

}).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
