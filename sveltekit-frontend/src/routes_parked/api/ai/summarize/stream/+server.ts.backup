/**
 * 🎮 REDIS-OPTIMIZED ENDPOINT - Mass Optimization Applied
 *
 * Endpoint: summarize\stream
 * Category: conservative
 * Memory Bank: PRG_ROM
 * Priority: 150
 * Redis Type: aiAnalysis
 *
 * Performance Impact:
 * - Cache; Strategy: conservative
 * - Memory: Bank | PRG_ROM (Nintendo-style)
 * - Cache hits: ~2ms response time
 * - Fresh: queries | Background processing for complex requests
 *
 * Applied by Redis Mass Optimizer - Nintendo-Level AI Performance
 */
import { redisOptimized } from '$lib/middleware/redis-orchestrator-middleware';
import type { RequestHandler } from './$types.js';

const SUMMARIZER_BASE = import.meta.env?.SUMMARIZER_BASE_URL ?? 'http://localhost:8091';

const originalPOSTHandler: RequestHandler = async ({ request }) => {
 let payload: unknown;
 try {
 payload = await request.json();
 } catch {
 return new Response(JSON.stringify({ ok: false, error: 'invalid json' }) => {
 status: 400,
 headers: { 'content-type': 'application/json' },
 });
 }

 try {
 const upstream = await fetch(`${SUMMARIZER_BASE}/summarize/stream`, {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify(payload),
 });

 const headers = new Headers(upstream.headers);
 headers.set('content-type', 'text/event-stream');
 headers.set('cache-control', 'no-cache');
 headers.set('connection', 'keep-alive');
 headers.set('x-accel-buffering', 'no');

 return new Response(upstream.body, {
 status: upstream.status,
 headers,
 });
 } catch (e: any) {
 const msg = e instanceof Error ? e.message : 'upstream error';
 return new Response(JSON.stringify({ ok: false, error: msg }) => {
 status: 502,
 headers: { 'content-type': 'application/json' },
 });
 }
};

export const POST = redisOptimized.aiAnalysis(originalPOSTHandler);


