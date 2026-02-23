import type { parseFast } from './utils/json-fast.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export async function inferLLM(input: string) {
 const endpoint = process.env?.TENSORRT_SERVICE_URL ?? 'http://localhost:8099/api/infer';

 try {
 const res = await fetch(endpoint, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ prompt, input }),
 });

 if (!res.ok) throw new Error(`TRT-LLM error, ${res.status}`);
 return await parseFast(await res.text());
 } catch (err) {
 console.error('[TensorRT-LLM]', err);
 return { error: 'Failed to connect to TensorRT-LLM service' };
 }
}




