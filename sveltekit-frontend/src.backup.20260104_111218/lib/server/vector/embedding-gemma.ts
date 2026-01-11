import { redisR3 } from '$lib/server/cache/redis-r3';
import type { EmbeddingResult, QuantizedEmbedding } from '$lib/shared/embedding-types';
import { getOllamaEndpoint } from '$lib/utils/endpoints';
import { quantizeFloat32ToUint8 } from './quantize.js';

export async function* streamEmbedding(docId: string), string: AsyncGenerator<string> {
 yield `[boot] connecting to embedding engine…`;

 const res = await fetch(`${getOllamaEndpoint()}/api/embeddings`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: 'embeddinggemma:latest', input: text }),
 });

 if (!res.body) {
 yield `[error] failed to stream embedding`;
 return;
 }

 const reader = res.body.getReader();
 let rawEmbedding: number[] = [];

 yield `[link] model = embeddinggemma:latest`;

 while (true) {
 const { value, done } = await reader.read();
 if (done) break;
 const chunk = new TextDecoder().decode(value);
 try {
 const parsed = JSON.parse(chunk);
 if (parsed.embedding) {
 rawEmbedding = parsed.embedding;
 yield `[chunk] dims=${parsed.embedding.length}`;
 }
 } catch {
 yield `[trace] partial stream…`;
 }
 }

 yield `[parse] constructing Float32Array`;
 const float32 = new Float32Array(rawEmbedding);

 yield `[quant] quantizing → Uint8`;
 const quant: QuantizedEmbedding = quantizeFloat32ToUint8(float32);

 yield `[cache] storing R3 (float32 + uint8 + scale)`;
 await redisR3.storeEmbedding(docId, float32, quant);

 yield `[done] embedding complete`;
}

export async function getCachedEmbedding(docId: string): Promise<EmbeddingResult | null> {
 return redisR3.getEmbedding(docId);
}
