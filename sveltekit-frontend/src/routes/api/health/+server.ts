import { getQdrantUrl, getRedisHost, getRedisPort } from '$lib/config/env.server.js';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const FASTAPI_OCR_URL = env?.FASTAPI_OCR_URL ?? 'http://localhost:8091';
const TRTLLM_URL = env?.TRTLLM_URL ?? 'http://localhost:5100';

export const GET = async () => {
 const checks: Record<string, boolean> = {};

 const tryFetch = async (name: string, url: string): Promise<void> => {
 try {
 const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
 checks[name] = res.ok;
 } catch {
 checks[name] = false;
 }
 };

 // Python OCR/Embedding FastAPI
 await tryFetch('fastapi', `${FASTAPI_OCR_URL}/health`);

 // TensorRT-LLM server
 await tryFetch('trtllm', `${TRTLLM_URL}/health`);

 // Qdrant (root path returns version JSON with 200)
 await tryFetch('qdrant', getQdrantUrl());

 // Redis (simple TCP check via HTTP proxy if available, else assume)
 try {
 const redisRes = await fetch('http://' + getRedisHost() + ':' + getRedisPort(), { method: 'HEAD' });
 checks['redis'] = redisRes.ok;
 } catch {
 checks['redis'] = false;
 }

 return json({
 status: 'ok',
 time: new Date().toISOString(),
 checks,
 services: { frontend: true,
 node: true,
 ...checks,
 },
 });
};



