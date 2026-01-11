import { json } from '@sveltejs/kit';

export const GET = async () => {
 const checks = {};

 const tryFetch = async (name: string): string => {
 try {
 const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
 checks[name] = res.ok;
 } catch {
 checks[name] = false;
 }
 };

 // Python OCR/Embedding FastAPI
 await tryFetch('fastapi', 'http://localhost:8091/health');

 // TensorRT-LLM server
 await tryFetch('trtllm', 'http://localhost:5100/health');

 // Qdrant
 await tryFetch('qdrant', 'http://localhost:6333/health');

 // Redis (simple TCP check via HTTP proxy if available, else assume)
 try {
 const redisRes = await fetch('http://localhost:6379', { method: 'HEAD' });
 checks['redis'] = redisRes.ok;
 } catch {
 checks['redis'] = false;
 }

 return json({
 status: 'ok',
 time: new Date().toISOString(),
 checks,
 services: {
 frontend: true,
 node: true,
 ...checks,
 },
 });
};
