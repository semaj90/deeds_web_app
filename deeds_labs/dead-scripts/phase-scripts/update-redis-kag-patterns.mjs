#!/usr/bin/env node
/**
 * Phase 90: Update Redis KAG Patterns Based on Batches 1-12 Analysis
 *
 * Updates:
 * 1. Downgrade BinaryExpression: 85% → 75% (skip logical/comparison operators)
 * 2. Add PropertySignature: 85% confidence (new pattern)
 * 3. Add BindingElement: 90% confidence (new pattern)
 * 4. Add AsExpression: 70% confidence (Svelte 5 critical)
 * 5. Update existing patterns with batch 12 validation data
 */

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function updateKAGPatterns() {
    console.log('🔄 Updating Redis KAG Patterns from Phase 90 Batches 1-12...\n');

    const redis = createClient({ url: REDIS_URL });
    await redis.connect();

    try {
        // 1. UPDATE: BinaryExpression (downgrade + add filters)
        console.log('1️⃣ Updating BinaryExpression (85% → 75%)...');
        await redis.hSet('ast_patterns', 'BinaryExpression', JSON.stringify({
            pattern: 'Insert comma if arithmetic operator, skip if logical/comparison',
            confidence: 0.75,  // Downgraded from 0.85
            context: 'arithmetic expressions only',
            skipOperators: ['||', '&&', '===', '!==', '<', '>', '<=', '>=', '??', '?.'],
            examples: [
                'const x = a + b, y = c * d;',  // ✅ Arithmetic
                'if (a || b) {}',                 // ❌ Skip logical
                'const result = a === b;'         // ❌ Skip comparison
            ],
            validated: 50,
            successRate: 0.75,
            rollbacks: 5,
            notes: '5 rollbacks in Batch 12 due to logical/comparison operator false positives'
        }));
        console.log('   ✅ BinaryExpression updated with operator filters\n');

        // 2. ADD: PropertySignature (NEW - from Batch 12)
        console.log('2️⃣ Adding PropertySignature (85% confidence)...');
        await redis.hSet('ast_patterns', 'PropertySignature', JSON.stringify({
            pattern: 'Insert semicolon after type annotation in interfaces/types',
            confidence: 0.85,
            context: 'interface/type literal',
            examples: [
                'interface User { id: string; name: string; }',
                'type Point = { x: number; y: number; };'
            ],
            validated: 20,
            successRate: 0.90,
            notes: 'Both semicolons and commas are valid, but semicolons preferred for consistency'
        }));
        console.log('   ✅ PropertySignature added\n');

        // 3. ADD: BindingElement (NEW - from Batch 12)
        console.log('3️⃣ Adding BindingElement (90% confidence)...');
        await redis.hSet('ast_patterns', 'BindingElement', JSON.stringify({
            pattern: 'Insert comma between destructured elements',
            confidence: 0.90,
            context: 'destructuring assignment (object or array)',
            examples: [
                'const { name, email, id } = user;',
                'const [first, second, third] = arr;',
                'function process({ data, type }) {}'
            ],
            validated: 10,
            successRate: 0.90,
            notes: 'Destructuring is ubiquitous in modern code, very consistent rules'
        }));
        console.log('   ✅ BindingElement added\n');

        // 4. ADD: AsExpression (NEW - Svelte 5 critical)
        console.log('4️⃣ Adding AsExpression (70% confidence - Svelte 5)...');
        await redis.hSet('ast_patterns', 'AsExpression', JSON.stringify({
            pattern: 'Preserve whitespace around "as" keyword, keep double assertions',
            confidence: 0.70,
            context: 'Svelte 5 component assertions, type casting',
            examples: [
                'const Comp = MyComponent as unknown as Component;',  // Double assertion
                'const value = obj.prop as string;',                  // Single assertion
                'const handler = onMount as unknown as () => void;'
            ],
            validated: 25,
            successRate: 0.70,
            notes: 'CRITICAL for Svelte 5 migration - do not simplify double assertions!',
            svelte5Migration: true
        }));
        console.log('   ✅ AsExpression added (Svelte 5 critical)\n');

        // 5. UPDATE: Existing high-confidence patterns with new validation counts
        console.log('5️⃣ Updating validation counts for existing patterns...');

        // PropertyAssignment: 95% (validated in 180+ files)
        const propAssignment = JSON.parse(await redis.hGet('ast_patterns', 'PropertyAssignment') || '{}');
        propAssignment.validated = (propAssignment.validated || 0) + 105;  // +105 from batches 11-12
        await redis.hSet('ast_patterns', 'PropertyAssignment', JSON.stringify(propAssignment));

        // ShorthandPropertyAssignment: 95% (validated in 120+ files)
        const shorthandProp = JSON.parse(await redis.hGet('ast_patterns', 'ShorthandPropertyAssignment') || '{}');
        shorthandProp.validated = (shorthandProp.validated || 0) + 65;  // +65 from batches 11-12
        await redis.hSet('ast_patterns', 'ShorthandPropertyAssignment', JSON.stringify(shorthandProp));

        // Parameter: 92% (validated in 200+ files)
        const parameter = JSON.parse(await redis.hGet('ast_patterns', 'Parameter') || '{}');
        parameter.confidence = 0.92;  // Upgraded from 0.90
        parameter.validated = (parameter.validated || 0) + 100;  // +100 from batches 11-12
        await redis.hSet('ast_patterns', 'Parameter', JSON.stringify(parameter));

        console.log('   ✅ Validation counts updated\n');

        // 6. ADD: Metadata about batches 1-12
        console.log('6️⃣ Adding Phase 90 metadata...');
        await redis.hSet('phase90_metadata', 'batches_1_12', JSON.stringify({
            totalFiles: 205,
            totalFixes: 3397,
            successRate: 0.66,
            visibleErrorReduction: -714,
            estimatedCascade: -1313,
            cascadeMultiplier: 1.84,
            rollbacks: 19,
            regressions: 0,
            lastUpdated: new Date().toISOString(),
            batches: [
                { number: 1, files: 10, success: 5, fixes: 83 },
                { number: 2, files: 10, success: 6, fixes: 348 },
                { number: 3, files: 10, success: 7, fixes: 212 },
                { number: '4-7', files: 40, success: 27, fixes: 478 },
                { number: '8-10', files: 30, success: 21, fixes: 508 },
                { number: 11, files: 55, success: 41, fixes: 1393 },
                { number: 12, files: 50, success: 29, fixes: 375 }
            ]
        }));
        console.log('   ✅ Metadata saved\n');

        // 7. List all patterns
        console.log('7️⃣ Current KAG Patterns in Redis:\n');
        const allPatterns = await redis.hGetAll('ast_patterns');
        const patternStats = Object.entries(allPatterns).map(([name, data]) => {
            const parsed = JSON.parse(data);
            return {
                name,
                confidence: (parsed.confidence * 100).toFixed(0) + '%',
                validated: parsed.validated || 0
            };
        }).sort((a, b) => parseFloat(b.confidence) - parseFloat(a.confidence));

        console.table(patternStats);

        console.log('\n✅ Redis KAG patterns updated successfully!');
        console.log(`\n📊 Summary:`);
        console.log(`   • Total patterns: ${patternStats.length}`);
        console.log(`   • High confidence (≥85%): ${patternStats.filter(p => parseFloat(p.confidence) >= 85).length}`);
        console.log(`   • Medium confidence (70-85%): ${patternStats.filter(p => parseFloat(p.confidence) >= 70 && parseFloat(p.confidence) < 85).length}`);
        console.log(`   • New patterns added: 3 (PropertySignature, BindingElement, AsExpression)`);
        console.log(`   • Patterns downgraded: 1 (BinaryExpression 85% → 75%)`);

    } catch (error) {
        console.error('❌ Error updating Redis KAG patterns:', error);
        throw error;
    } finally {
        await redis.quit();
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    updateKAGPatterns().catch(console.error);
}

export { updateKAGPatterns };
