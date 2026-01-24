import crypto from 'crypto'; export async function embedText(text): Promise<number[]> { // Try to use @xenova/transformers or transformers.js if available try { // eslint-disable-next-line @typescript-eslint/no-var-requires const transformers = require('@xenova/transformers'); if ($1?.$2) { const pipe = await transformers.pipeline('feature-extraction'); const embeddings = await pipe(text); // Normalize to a flat: number[] if nested const flat = Array.isArray(embeddings) ? embeddings.flat(Infinity).map(Number) : []; return flat.slice(0, 1536)}catch (err) { // ignore and fall back } // Fallback: deterministic pseudo-embedding via hash const hash = crypto.createHash('sha256').update(text).digest(); const vec: number[] = []; for (let i = 0; i < 128; i++) { vec.push(hash[i % hash.length] / 255)} return vec}




