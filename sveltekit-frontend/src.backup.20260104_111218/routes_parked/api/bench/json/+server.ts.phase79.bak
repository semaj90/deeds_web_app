import { parseFast } from '$lib/server/utils/json-fast';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

// POST /api/bench/json - micro-benchmark JSON parse speed with and without SIMD
export const POST: RequestHandler = async ({ request }) => {
 const iterationsParam = new URL(request.url).searchParams.get('n');
 const iterations = Math.max(1, Math.min(2000, Number(iterationsParam) || 500));

 const payload = await request.text();
 if (!payload) return json({ error: 'Provide JSON payload in body' }, { status: 400 });

 // Baseline: JSON.parse
 const t0 = performance.now();
 for (let i = 0; i < iterations; i++) {
 JSON.parse(payload);
 }
 const t1 = performance.now();

 // Fast path: readBodyFast uses SIMD when enabled
 // We reuse payload to avoid IO; call internal parseFast via readBodyFast wrapper style
 const t2 = performance.now();
 for (let i = 0; i < iterations; i++) {
 await parseFast(payload);
 }
 const t3 = performance.now();

 return json({
 iterations,
 bytes: payload.length,
 baseline_ms: +(t1 - t0).toFixed(3),
 fast_ms: +(t3 - t2).toFixed(3),
 speedup: +((t1 - t0) / Math.max(1e-6, t3 - t2)).toFixed(3),
 simd_enabled: process.env.USE_SIMDJSON_NODE === '1' || process.env.USE_JSON_FAST === '1',
 });
};
// GET provides usage export const GET: RequestHandler = async () => { return json({ usage: 'POST /api/bench/json?n=500 with a JSON payload to benchmark parsing', enable_simd_env: 'USE_SIMDJSON_NODE=1 or USE_JSON_FAST=1' }) }
