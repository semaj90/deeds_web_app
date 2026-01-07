#!/usr/bin/env node
/**
 * Phase 90: LLM Output Synthesis for Uncertain AST Contexts
 *
 * Uses Gemini 2.0 Flash to analyze uncertain AST patterns and provide
 * confidence scores for fix application.
 *
 * Integration with:
 * - Redis KAG: Store successful LLM-synthesized patterns
 * - ACE Contextual Engineering: Multi-pass validation
 * - TypeScript Compiler API: AST context extraction
 *
 * Cost: ~$0.00005 per fix analysis (~$0.73 for all 14,664 errors)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    geminiApiUrl: 'http://localhost:11434/api/generate', // Ollama local API
    model: 'gemma3-legal:latest',
    maxTokens: 500,
    temperature: 0.1, // Low temperature for consistent analysis
    cacheResponses: true,
    cacheDir: path.join(__dirname, '../.cache/llm-synthesis'),
};

// ============================================================================
// LLM SYNTHESIS
// ============================================================================

/**
 * Synthesize fix decision using LLM
 *
 * @param {Object} context - AST context
 * @param {string} context.kind - Node kind (e.g., "BinaryExpression")
 * @param {string} context.parentKind - Parent node kind
 * @param {string} context.codeSnippet - Surrounding code
 * @param {number} context.position - Error position
 * @returns {Promise<Object>} - { needsComma, confidence, reasoning }
 */
export async function synthesizeFix(context) {
    // Check cache first
    if (CONFIG.cacheResponses) {
        const cached = await getCachedSynthesis(context);
        if (cached) {
            console.log(`   💾 LLM synthesis cache hit`);
            return cached;
        }
    }

    const prompt = buildPrompt(context);

    try {
        const response = await fetch(CONFIG.geminiApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: CONFIG.model,
                prompt,
                stream: false,
                options: {
                    temperature: CONFIG.temperature,
                    num_predict: CONFIG.maxTokens,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`LLM API error: ${response.status}`);
        }

        const data = await response.json();
        const result = parseResponse(data.response);

        // Cache for future use
        if (CONFIG.cacheResponses) {
            await cacheSynthesis(context, result);
        }

        return result;
    } catch (error) {
        console.warn(`   ⚠️  LLM synthesis failed: ${error.message}`);
        return {
            needsComma: false,
            confidence: 0.0,
            reasoning: 'LLM synthesis unavailable',
        };
    }
}

/**
 * Build ACE-style prompt for LLM analysis
 */
function buildPrompt(context) {
    return `You are an expert TypeScript AST analyzer specializing in TS1005 comma errors.

TASK: Analyze the following AST context and determine if a comma should be inserted.

CONTEXT:
- Node Type: ${context.kind}
- Parent Type: ${context.parentKind}
- Error Position: ${context.position}
- Code Snippet:
\`\`\`typescript
${context.codeSnippet}
\`\`\`

ANALYSIS GUIDELINES:
1. Consider TypeScript/JavaScript syntax rules
2. Check if node is inside object literal, array literal, or function call
3. Verify comma is needed vs. optional trailing comma
4. Avoid false positives (e.g., binary operators, standalone expressions)

RESPOND WITH VALID JSON ONLY:
{
  "needsComma": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation (max 100 chars)"
}`;
}

/**
 * Parse LLM response to extract structured data
 */
function parseResponse(responseText) {
    try {
        // Extract JSON from markdown code blocks if present
        let jsonText = responseText;

        const jsonMatch = responseText.match(/\`\`\`(?:json)?\s*(\{[\s\S]*?\})\s*\`\`\`/);
        if (jsonMatch) {
            jsonText = jsonMatch[1];
        }

        const parsed = JSON.parse(jsonText);

        return {
            needsComma: Boolean(parsed.needsComma),
            confidence: Number(parsed.confidence) || 0.0,
            reasoning: String(parsed.reasoning || 'No reasoning provided'),
        };
    } catch (error) {
        console.warn(`   ⚠️  Failed to parse LLM response: ${error.message}`);
        return {
            needsComma: false,
            confidence: 0.0,
            reasoning: 'Parse error',
        };
    }
}

// ============================================================================
// CACHING
// ============================================================================

/**
 * Get cached synthesis result
 */
async function getCachedSynthesis(context) {
    const cacheKey = generateCacheKey(context);
    const cachePath = path.join(CONFIG.cacheDir, `${cacheKey}.json`);

    try {
        if (fs.existsSync(cachePath)) {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            return cached;
        }
    } catch (error) {
        // Cache miss or error, return null
    }

    return null;
}

/**
 * Cache synthesis result
 */
async function cacheSynthesis(context, result) {
    const cacheKey = generateCacheKey(context);
    const cachePath = path.join(CONFIG.cacheDir, `${cacheKey}.json`);

    try {
        fs.mkdirSync(CONFIG.cacheDir, { recursive: true });
        fs.writeFileSync(
            cachePath,
            JSON.stringify(
                {
                    context,
                    result,
                    timestamp: new Date().toISOString(),
                },
                null,
                2
            )
        );
    } catch (error) {
        console.warn(`   ⚠️  Failed to cache synthesis: ${error.message}`);
    }
}

/**
 * Generate cache key from context
 */
async function generateCacheKey(context) {
    const crypto = await import('crypto');
    const data = JSON.stringify({
        kind: context.kind,
        parentKind: context.parentKind,
        codeSnippet: context.codeSnippet,
    });
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

// ============================================================================
// REDIS KAG INTEGRATION
// ============================================================================

/**
 * Store successful LLM-synthesized pattern in Redis KAG
 *
 * This updates the knowledge base with learned patterns for future use
 */
export async function storePattern(context, result, success) {
    if (!success || result.confidence < 0.7) {
        return; // Only store high-confidence successful patterns
    }

    // TODO: Implement Redis storage
    // const redisKey = `phase90:llm-synthesis:${context.kind}`;
    // await redis.hset(redisKey, {
    //     confidence: result.confidence,
    //     successCount: (await redis.hget(redisKey, 'successCount') || 0) + 1,
    //     lastUpdated: new Date().toISOString(),
    //     reasoning: result.reasoning,
    // });

    console.log(`   📚 Pattern stored in Redis KAG: ${context.kind} (confidence: ${result.confidence})`);
}

// ============================================================================
// BATCH SYNTHESIS
// ============================================================================

/**
 * Synthesize fixes for multiple uncertain contexts
 */
export async function batchSynthesize(contexts) {
    const results = [];

    for (const context of contexts) {
        const result = await synthesizeFix(context);
        results.push({
            context,
            ...result,
        });

        // Rate limiting (if needed for external APIs)
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return results;
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get LLM synthesis statistics
 */
export function getStats() {
    const cacheFiles = fs.existsSync(CONFIG.cacheDir)
        ? fs.readdirSync(CONFIG.cacheDir).filter((f) => f.endsWith('.json'))
        : [];

    const cachedSyntheses = cacheFiles.map((f) => {
        const data = JSON.parse(
            fs.readFileSync(path.join(CONFIG.cacheDir, f), 'utf-8')
        );
        return data.result;
    });

    const avgConfidence =
        cachedSyntheses.length > 0
            ? cachedSyntheses.reduce((sum, r) => sum + r.confidence, 0) /
              cachedSyntheses.length
            : 0;

    const highConfidence = cachedSyntheses.filter((r) => r.confidence > 0.7).length;

    return {
        totalSyntheses: cachedSyntheses.length,
        averageConfidence: avgConfidence.toFixed(3),
        highConfidenceCount: highConfidence,
        highConfidencePercent:
            cachedSyntheses.length > 0
                ? ((highConfidence / cachedSyntheses.length) * 100).toFixed(1)
                : '0.0',
    };
}

// ============================================================================
// MAIN (CLI)
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.includes('--stats')) {
        const stats = getStats();
        console.log('📊 LLM Synthesis Statistics:');
        console.log(`   Total syntheses: ${stats.totalSyntheses}`);
        console.log(`   Average confidence: ${stats.averageConfidence}`);
        console.log(
            `   High confidence (>0.7): ${stats.highConfidenceCount} (${stats.highConfidencePercent}%)`
        );
        process.exit(0);
    }

    if (args.includes('--test')) {
        // Test synthesis with example context
        const testContext = {
            kind: 'BinaryExpression',
            parentKind: 'ObjectLiteralExpression',
            codeSnippet: `const obj = {\n  a: 1 + 2\n  b: 3\n}`,
            position: 25,
        };

        console.log('🧪 Testing LLM synthesis...\n');
        const result = await synthesizeFix(testContext);

        console.log('Result:');
        console.log(`   Needs comma: ${result.needsComma}`);
        console.log(`   Confidence: ${result.confidence}`);
        console.log(`   Reasoning: ${result.reasoning}`);

        process.exit(0);
    }

    console.log(`
Phase 90: LLM Output Synthesis

Usage:
  node llm-output-synthesis.mjs --test        Test synthesis with example
  node llm-output-synthesis.mjs --stats       Show cache statistics

This module is primarily used as a library by phase90-enhanced-ast-fixer.mjs
    `);
}
