#!/usr/bin/env node
/**
 * Phase 90: Update Redis KAG Patterns Based on Batches 1-12 Analysis
 * Version 2: Fixed with explicit logging and error handling
 */

import fs from 'fs/promises';
import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function updateKAGPatterns() {
    const logFile = 'reports/redis-kag-update.log';
    const log = async (msg) => {
        console.log(msg);
        await fs.appendFile(logFile, msg + '\n').catch(() => {});
    };

    try {
        await log('🔄 Starting Redis KAG Pattern Update...');
        await log(`📡 Connecting to Redis at ${REDIS_URL}...`);

        const redis = createClient({ url: REDIS_URL });

        redis.on('error', (err) => log(`❌ Redis Client Error: ${err.message}`));
        redis.on('connect', () => log('✅ Redis client connecting...'));
        redis.on('ready', () => log('✅ Redis client ready'));

        await redis.connect();
        await log('✅ Connected to Redis\n');

        // 1. UPDATE: BinaryExpression (downgrade + add filters)
        await log('1️⃣ Updating BinaryExpression (85% → 75%)...');
        await redis.hSet('ast_patterns', 'BinaryExpression', JSON.stringify({
            pattern: 'Insert comma if arithmetic operator, skip if logical/comparison',
            confidence: 0.75,
            context: 'arithmetic expressions only',
            skipOperators: ['||', '&&', '===', '!==', '<', '>', '<=', '>=', '??', '?.'],
            examples: [
                'const x = a + b, y = c * d;',
                'if (a || b) {}',
                'const result = a === b;'
            ],
            validated: 50,
            successRate: 0.75,
            rollbacks: 5,
            notes: 'Batch 12: 5 rollbacks due to logical/comparison operator false positives'
        }));
        await log('   ✅ BinaryExpression updated');

        // 2. ADD: PropertySignature (new pattern)
        await log('2️⃣ Adding PropertySignature (85% confidence)...');
        await redis.hSet('ast_patterns', 'PropertySignature', JSON.stringify({
            pattern: 'Interface/type property needs comma separator',
            confidence: 0.85,
            context: 'TypeScript interface or type literal properties',
            examples: [
                'interface User { name: string, age: number }',
                'type Config = { port: number, host: string }'
            ],
            validated: 15,
            successRate: 0.85,
            notes: 'Batch 1-12: High confidence in type signatures'
        }));
        await log('   ✅ PropertySignature added');

        // 3. ADD: BindingElement (new pattern)
        await log('3️⃣ Adding BindingElement (90% confidence)...');
        await redis.hSet('ast_patterns', 'BindingElement', JSON.stringify({
            pattern: 'Array/object destructuring needs comma',
            confidence: 0.90,
            context: 'Destructuring assignments',
            examples: [
                'const [a, b, c] = array;',
                'const { x, y, z } = object;'
            ],
            validated: 20,
            successRate: 0.90,
            notes: 'Batch 1-12: Very reliable pattern'
        }));
        await log('   ✅ BindingElement added');

        // 4. ADD: AsExpression (Svelte 5 critical)
        await log('4️⃣ Adding AsExpression (70% confidence - Svelte 5)...');
        await redis.hSet('ast_patterns', 'AsExpression', JSON.stringify({
            pattern: 'Type assertion/cast may need comma in sequence',
            confidence: 0.70,
            context: 'TypeScript type assertions, especially in Svelte 5 rune contexts',
            examples: [
                'const items = data as Item[], count = items.length;',
                'const state = $state() as State, derived = $derived(() => state.value);'
            ],
            validated: 10,
            successRate: 0.70,
            notes: 'Batch 1-12: Important for Svelte 5 migration, moderate confidence',
            svelteVersion: 5
        }));
        await log('   ✅ AsExpression added');

        // 5. UPDATE: Existing high-confidence patterns with validation data
        await log('5️⃣ Updating existing patterns with Batch 1-12 validation...');

        const updates = [
            {
                name: 'PropertyAssignment',
                validated: 205,
                successRate: 0.95,
                notes: 'Batches 1-12: 205 files validated'
            },
            {
                name: 'ShorthandPropertyAssignment',
                validated: 180,
                successRate: 0.95,
                notes: 'Batches 1-12: Most reliable pattern'
            },
            {
                name: 'Parameter',
                validated: 200,
                successRate: 0.92,
                notes: 'Batches 1-12: High confidence'
            }
        ];

        for (const update of updates) {
            const existing = await redis.hGet('ast_patterns', update.name);
            if (existing) {
                const pattern = JSON.parse(existing);
                pattern.validated = update.validated;
                pattern.successRate = update.successRate;
                pattern.notes = update.notes;
                await redis.hSet('ast_patterns', update.name, JSON.stringify(pattern));
                await log(`   ✅ ${update.name} updated (${update.validated} validated)`);
            }
        }

        // 6. ADD: Phase 90 metadata
        await log('6️⃣ Adding Phase 90 metadata...');
        await redis.hSet('kag_metadata', 'phase90_batches_1_12', JSON.stringify({
            totalFiles: 205,
            totalFixes: 3397,
            successRate: 0.66,
            visibleReduction: -714,
            cascadeReduction: -1313,
            patternsUpdated: 4,
            patternsAdded: 3,
            timestamp: new Date().toISOString()
        }));
        await log('   ✅ Phase 90 metadata added');

        // 7. List all patterns
        await log('\n7️⃣ Current KAG Patterns in Redis:');
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
        await log(`\n✅ Total patterns: ${patternSummary.length}`);

        await redis.quit();
        await log('\n✅ Redis KAG patterns successfully updated!\n');
        await log('📊 Summary:');
        await log('   • 1 pattern downgraded (BinaryExpression: 85% → 75%)');
        await log('   • 3 new patterns added (PropertySignature, BindingElement, AsExpression)');
        await log('   • 3 existing patterns updated with validation data');
        await log('   • Phase 90 metadata recorded\n');

        return { success: true, patterns: patternSummary.length };

    } catch (error) {
        await log(`\n❌ ERROR: ${error.message}`);
        await log(`Stack: ${error.stack}`);
        throw error;
    }
}

// Run if called directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
    updateKAGPatterns()
        .then(result => {
            console.log(`\n✅ Update complete: ${result.patterns} patterns in Redis`);
            process.exit(0);
        })
        .catch(err => {
            console.error('\n❌ Update failed:', err.message);
            process.exit(1);
        });
}

export { updateKAGPatterns };
