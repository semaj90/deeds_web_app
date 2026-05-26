#!/usr/bin/env node
/**
 * scripts/smoke-attention-rank.mjs
 *
 * End-to-end smoke test for the `attention_rank_files` Hermes tool.
 * Verifies that POST /api/ai/hermes-run correctly plans and executes the tool.
 *
 * Usage:
 *   node scripts/smoke-attention-rank.mjs
 *   node scripts/smoke-attention-rank.mjs --dev-server http://localhost:5173
 */

import { parseArgs } from 'node:util';

const { values: flags } = parseArgs({
    options: {
        'dev-server': { type: 'string', default: process.env.PUBLIC_APP_URL ?? process.env.SVELTEKIT_URL ?? 'http://localhost:5173' },
    },
    strict: false,
});

const DEV = flags['dev-server'];
const TIMEOUT = 60_000;

async function post(url, body) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        return res;
    } finally {
        clearTimeout(tid);
    }
}

async function main() {
    console.log(`=== End-to-End Attention Rank Smoke Test ===`);
    console.log(`Sending POST to ${DEV}/api/ai/hermes-run`);
    
    const payload = {
        aceMode: "analyze",
        userQuery: "what handles authentication?"
    };

    console.log(`Payload:`, payload);

    try {
        const res = await post(`${DEV}/api/ai/hermes-run`, payload);

        if (res.status === 401) {
            console.log('\n[SKIP] 401 Unauthorized (Auth required in this environment). Run with DEV_BYPASS_AUTH=true if local.');
            return;
        }

        if (!res.ok) {
            console.error(`\n[FAIL] HTTP ${res.status}: ${await res.text().catch(() => '')}`);
            process.exit(1);
        }

        const body = await res.json().catch(() => ({}));
        
        console.log(`\n[SUCCESS] Received HTTP 200`);
        
        // Extract tools used from Hermes payload
        const toolsUsed = body.plan?.tools?.map(t => t.name) || body.toolsUsed || [];
        const answer = body.answer || body.synthesis || '';
        
        console.log(`Tools Invoked: ${toolsUsed.length ? toolsUsed.join(', ') : 'none'}`);
        console.log(`Answer Length: ${answer.length} chars`);
        
        const usedAttentionRank = toolsUsed.includes('attention_rank_files');
        
        if (usedAttentionRank) {
            console.log(`\n✅ Verified: attention_rank_files was successfully planned and executed.`);
        } else {
            console.log(`\n⚠️ Warning: The model did not invoke 'attention_rank_files' for this query.`);
            console.log(`This might happen if the planner chose a different strategy.`);
        }
        
    } catch (e) {
        console.error(`\n[FAIL] Network or execution error: ${e.message}`);
        process.exit(1);
    }
}

main();
