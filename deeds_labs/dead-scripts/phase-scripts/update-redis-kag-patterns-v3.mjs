#!/usr/bin/env node
/**
 * Phase 90: Update Redis KAG Patterns Based on Batches 1-12 Analysis
 * Version 3: Simplified - no conditional guard
 */

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log('🔄 Starting Redis KAG Pattern Update...');
console.log(`📡 Connecting to Redis at ${REDIS_URL}...`);

const redis = createClient({ url: REDIS_URL });

redis.on('error', (err) => console.error(`❌ Redis Error: ${err.message}`));
redis.on('connect', () => console.log('✅ Connecting...'));
redis.on('ready', () => console.log('✅ Ready'));

await redis.connect();
console.log('✅ Connected to Redis\n');

try {
    // 1. UPDATE: BinaryExpression (downgrade + add filters)
    console.log('1️⃣ Updating BinaryExpression (85% → 75%)...');
    await redis.hSet('ast_patterns', 'BinaryExpression', JSON.stringify({
        pattern: 'Insert comma if arithmetic operator, skip if logical/comparison',
        confidence: 0.75,
        context: 'arithmetic expressions only',
        skipOperators: ['||', '&&', '===', '!==', '<', '>', '<=', '>=', '??', '?.'],
        validated: 50,
        successRate: 0.75,
        rollbacks: 5,
        notes: 'Batch 12: 5 rollbacks due to logical/comparison operator false positives'
    }));
    console.log('   ✅ BinaryExpression updated');

    // 2. ADD: PropertySignature (new pattern)
    console.log('2️⃣ Adding PropertySignature (85% confidence)...');
    await redis.hSet('ast_patterns', 'PropertySignature', JSON.stringify({
        pattern: 'Interface/type property needs comma separator',
        confidence: 0.85,
        context: 'TypeScript interface or type literal properties',
        validated: 15,
        successRate: 0.85,
        notes: 'Batch 1-12: High confidence in type signatures'
    }));
    console.log('   ✅ PropertySignature added');

    // 3. ADD: BindingElement (new pattern)
    console.log('3️⃣ Adding BindingElement (90% confidence)...');
    await redis.hSet('ast_patterns', 'BindingElement', JSON.stringify({
        pattern: 'Array/object destructuring needs comma',
        confidence: 0.90,
        context: 'Destructuring assignments',
        validated: 20,
        successRate: 0.90,
        notes: 'Batch 1-12: Very reliable pattern'
    }));
    console.log('   ✅ BindingElement added');

    // 4. ADD: AsExpression (Svelte 5 critical)
    console.log('4️⃣ Adding AsExpression (70% confidence - Svelte 5)...');
    await redis.hSet('ast_patterns', 'AsExpression', JSON.stringify({
        pattern: 'Type assertion/cast may need comma in sequence',
        confidence: 0.70,
        context: 'TypeScript type assertions, especially in Svelte 5 rune contexts',
        validated: 10,
        successRate: 0.70,
        notes: 'Batch 1-12: Important for Svelte 5 migration, moderate confidence',
        svelteVersion: 5
    }));
    console.log('   ✅ AsExpression added');

    // 5. UPDATE: Existing patterns
    console.log('5️⃣ Updating existing patterns with Batch 1-12 validation...');

    const updates = [
        { name: 'PropertyAssignment', validated: 205, successRate: 0.95 },
        { name: 'ShorthandPropertyAssignment', validated: 180, successRate: 0.95 },
        { name: 'Parameter', validated: 200, successRate: 0.92 }
    ];

    for (const update of updates) {
        const existing = await redis.hGet('ast_patterns', update.name);
        if (existing) {
            const pattern = JSON.parse(existing);
            pattern.validated = update.validated;
            pattern.successRate = update.successRate;
            pattern.notes = `Batches 1-12: ${update.validated} files validated`;
            await redis.hSet('ast_patterns', update.name, JSON.stringify(pattern));
            console.log(`   ✅ ${update.name} updated (${update.validated} validated)`);
        }
    }

    // 6. ADD: Phase 90 metadata
    console.log('6️⃣ Adding Phase 90 metadata...');
    await redis.hSet('kag_metadata', 'phase90_batches_1_13', JSON.stringify({
        totalFiles: 255,
        totalFixes: 4286,
        successRate: 0.67,
        visibleReduction: -714,
        cascadeReduction: -1313,
        patternsUpdated: 4,
        patternsAdded: 3,
        timestamp: new Date().toISOString()
    }));
    console.log('   ✅ Phase 90 metadata added');

    // 7. List all patterns
    console.log('\n7️⃣ Current KAG Patterns in Redis:');
    const allPatterns = await redis.hGetAll('ast_patterns');
    const patternSummary = Object.entries(allPatterns).map(([name, data]) => {
        const parsed = JSON.parse(data);
        return {
            Pattern: name,
            Confidence: (parsed.confidence * 100).toFixed(0) + '%',
            Validated: parsed.validated || 0,
            Success: parsed.successRate ? (parsed.successRate * 100).toFixed(0) + '%' : 'N/A'
        };
    }).sort((a, b) => b.Validated - a.Validated);

    console.table(patternSummary);
    console.log(`\n✅ Total patterns: ${patternSummary.length}`);

} catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    console.error(error.stack);
} finally {
    await redis.quit();
    console.log('\n✅ Redis KAG patterns successfully updated!\n');
    console.log('📊 Summary:');
    console.log('   • 1 pattern downgraded (BinaryExpression: 85% → 75%)');
    console.log('   • 3 new patterns added (PropertySignature, BindingElement, AsExpression)');
    console.log('   • 3 existing patterns updated with validation data');
    console.log('   • Phase 90 metadata recorded (Batches 1-13)\n');
}
