#!/usr/bin/env node
/**
 * Phase 90: Complexity Pre-Filter for Smart Batching
 *
 * Analyzes TypeScript files to calculate complexity scores before batching.
 * Routes files to appropriate processing pipelines based on complexity:
 * - Simple (<25): Auto-batch with high confidence
 * - Medium (25-50): Slow batch with conservative settings
 * - Complex (>50): Manual review required
 *
 * Complexity factors:
 * - Import count (coupling)
 * - Generic type parameters (type complexity)
 * - Labeled statements (rare patterns)
 * - WebGPU/Worker APIs (non-standard AST nodes)
 * - Method overloads (signature complexity)
 */

import ts from 'typescript';
import fs from 'fs/promises';
import path from 'path';

/**
 * Calculate complexity score for a TypeScript file
 * @param {string} filePath - Absolute path to file
 * @returns {Promise<Object>} Complexity analysis
 */
export async function analyzeComplexity(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
    );

    let score = 0;
    const metrics = {
        importCount: 0,
        genericCount: 0,
        labelCount: 0,
        webGPUNodes: 0,
        workerNodes: 0,
        methodOverloads: 0,
        unionTypes: 0,
        intersectionTypes: 0,
        mappedTypes: 0
    };

    function visit(node) {
        // Count imports (coupling metric)
        if (ts.isImportDeclaration(node)) {
            metrics.importCount++;
        }

        // Count generic type parameters (type complexity)
        if (node.typeParameters && node.typeParameters.length > 0) {
            metrics.genericCount += node.typeParameters.length;
        }

        // Count labeled statements (rare patterns)
        if (ts.isLabeledStatement(node)) {
            metrics.labelCount++;
        }

        // Count method overloads (signature complexity)
        if (ts.isMethodSignature(node) || ts.isMethodDeclaration(node)) {
            const parent = node.parent;
            if (parent && (ts.isInterfaceDeclaration(parent) || ts.isClassDeclaration(parent))) {
                const name = node.name?.getText(sourceFile);
                if (name) {
                    // Simple overload detection - check if same method name appears multiple times
                    const siblings = parent.members || [];
                    const overloadCount = siblings.filter(m =>
                        (ts.isMethodSignature(m) || ts.isMethodDeclaration(m)) &&
                        m.name?.getText(sourceFile) === name
                    ).length;
                    if (overloadCount > 1) {
                        metrics.methodOverloads++;
                    }
                }
            }
        }

        // Count union types
        if (ts.isUnionTypeNode(node)) {
            metrics.unionTypes++;
        }

        // Count intersection types
        if (ts.isIntersectionTypeNode(node)) {
            metrics.intersectionTypes++;
        }

        // Count mapped types
        if (ts.isMappedTypeNode(node)) {
            metrics.mappedTypes++;
        }

        // Detect WebGPU APIs
        if (ts.isIdentifier(node)) {
            const text = node.getText(sourceFile);
            if (text.startsWith('GPU') || text.includes('WebGPU')) {
                metrics.webGPUNodes++;
            }
        }

        // Detect Worker APIs
        if (ts.isIdentifier(node)) {
            const text = node.getText(sourceFile);
            if (text.includes('Worker') || text === 'postMessage' || text === 'onmessage') {
                metrics.workerNodes++;
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    // Calculate weighted complexity score
    score += metrics.importCount * 0.5;         // Import coupling
    score += metrics.genericCount * 2;          // Type complexity
    score += metrics.labelCount * 5;            // Rare patterns (high weight)
    score += metrics.webGPUNodes * 3;           // Non-standard APIs
    score += metrics.workerNodes * 2.5;         // Worker complexity
    score += metrics.methodOverloads * 2;       // Signature complexity
    score += metrics.unionTypes * 1.5;          // Union type complexity
    score += metrics.intersectionTypes * 1.5;   // Intersection type complexity
    score += metrics.mappedTypes * 3;           // Mapped type complexity

    // Determine routing recommendation
    let recommendation, priority;
    if (score > 50) {
        recommendation = 'manual-review';
        priority = 'low';
    } else if (score > 25) {
        recommendation = 'slow-batch';
        priority = 'medium';
    } else {
        recommendation = 'auto-batch';
        priority = 'high';
    }

    return {
        filePath,
        score: Math.round(score * 10) / 10,
        metrics,
        recommendation,
        priority,
        reasons: buildReasons(metrics, score)
    };
}

/**
 * Build human-readable reasons for complexity score
 */
function buildReasons(metrics, score) {
    const reasons = [];

    if (metrics.importCount > 50) {
        reasons.push(`High coupling (${metrics.importCount} imports)`);
    } else if (metrics.importCount > 30) {
        reasons.push(`Medium coupling (${metrics.importCount} imports)`);
    }

    if (metrics.genericCount > 10) {
        reasons.push(`Complex generics (${metrics.genericCount} type parameters)`);
    }

    if (metrics.labelCount > 0) {
        reasons.push(`Rare patterns (${metrics.labelCount} labeled statements)`);
    }

    if (metrics.webGPUNodes > 0) {
        reasons.push(`Non-standard APIs (${metrics.webGPUNodes} WebGPU nodes)`);
    }

    if (metrics.workerNodes > 5) {
        reasons.push(`Worker complexity (${metrics.workerNodes} worker-related nodes)`);
    }

    if (metrics.methodOverloads > 5) {
        reasons.push(`Signature complexity (${metrics.methodOverloads} overloaded methods)`);
    }

    if (metrics.unionTypes > 10) {
        reasons.push(`Many union types (${metrics.unionTypes})`);
    }

    if (metrics.mappedTypes > 5) {
        reasons.push(`Advanced types (${metrics.mappedTypes} mapped types)`);
    }

    if (reasons.length === 0) {
        reasons.push('Simple file structure');
    }

    return reasons;
}

/**
 * Analyze multiple files and categorize by complexity
 */
export async function batchAnalyzeComplexity(filePaths) {
    console.log(`🔍 Analyzing complexity for ${filePaths.length} files...\n`);

    const results = await Promise.all(
        filePaths.map(fp => analyzeComplexity(fp))
    );

    // Categorize results
    const categorized = {
        'auto-batch': results.filter(r => r.recommendation === 'auto-batch'),
        'slow-batch': results.filter(r => r.recommendation === 'slow-batch'),
        'manual-review': results.filter(r => r.recommendation === 'manual-review')
    };

    // Sort each category by score (descending)
    for (const category in categorized) {
        categorized[category].sort((a, b) => b.score - a.score);
    }

    return {
        results,
        categorized,
        summary: {
            total: results.length,
            autoBatch: categorized['auto-batch'].length,
            slowBatch: categorized['slow-batch'].length,
            manualReview: categorized['manual-review'].length,
            avgScore: results.reduce((sum, r) => sum + r.score, 0) / results.length
        }
    };
}

/**
 * Generate batch recommendations
 */
export function generateBatchRecommendations(analysis) {
    const { categorized, summary } = analysis;

    console.log('📊 Complexity Analysis Summary:\n');
    console.log(`Total files: ${summary.total}`);
    console.log(`Average complexity: ${summary.avgScore.toFixed(1)}\n`);

    console.log('🚀 Auto-batch (high priority, <25 score):');
    console.log(`   ${summary.autoBatch} files - Process with high confidence`);
    if (categorized['auto-batch'].length > 0) {
        console.log(`   Top 5: ${categorized['auto-batch'].slice(0, 5).map(r => path.basename(r.filePath)).join(', ')}`);
    }
    console.log();

    console.log('⚡ Slow-batch (medium priority, 25-50 score):');
    console.log(`   ${summary.slowBatch} files - Process with conservative settings`);
    if (categorized['slow-batch'].length > 0) {
        console.log(`   Top 5: ${categorized['slow-batch'].slice(0, 5).map(r => path.basename(r.filePath)).join(', ')}`);
    }
    console.log();

    console.log('⚠️  Manual review (low priority, >50 score):');
    console.log(`   ${summary.manualReview} files - Route to manual review`);
    if (categorized['manual-review'].length > 0) {
        console.log(`   Examples:`);
        categorized['manual-review'].slice(0, 3).forEach(r => {
            console.log(`   • ${path.basename(r.filePath)} (score: ${r.score})`);
            console.log(`     Reasons: ${r.reasons.join(', ')}`);
        });
    }
    console.log();

    return {
        autoBatchFiles: categorized['auto-batch'].map(r => r.filePath),
        slowBatchFiles: categorized['slow-batch'].map(r => r.filePath),
        manualReviewFiles: categorized['manual-review'].map(r => r.filePath)
    };
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node complexity-pre-filter.mjs <file1.ts> [file2.ts] ...');
        console.log('   or: node complexity-pre-filter.mjs --analyze-batch <files.json>');
        process.exit(1);
    }

    if (args[0] === '--analyze-batch' && args[1]) {
        // Analyze batch from JSON file
        const fileList = JSON.parse(await fs.readFile(args[1], 'utf-8'));
        const analysis = await batchAnalyzeComplexity(fileList);
        generateBatchRecommendations(analysis);

        // Save results
        const outputPath = args[1].replace('.json', '-complexity-analysis.json');
        await fs.writeFile(outputPath, JSON.stringify(analysis, null, 2));
        console.log(`\n💾 Results saved to: ${outputPath}`);
    } else {
        // Analyze individual files
        for (const filePath of args) {
            const result = await analyzeComplexity(filePath);
            console.log(`\n📄 ${path.basename(result.filePath)}`);
            console.log(`   Score: ${result.score} (${result.recommendation})`);
            console.log(`   Priority: ${result.priority}`);
            console.log(`   Reasons: ${result.reasons.join(', ')}`);
            console.log(`   Metrics:`, result.metrics);
        }
    }
}
