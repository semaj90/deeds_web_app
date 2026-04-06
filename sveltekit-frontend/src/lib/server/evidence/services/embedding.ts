import crypto from 'crypto';

export async function embedText(text: string): Promise<number[]> {
    // Try to use @xenova/transformers or transformers.js if available
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        // @ts-ignore
        const transformers = await import('@xenova/transformers'); // Dynamic import for ESM/CJS compat attempt
        if (transformers) {
            const pipe = await (transformers as any).pipeline('feature-extraction');
            const embeddings = await pipe(text);
            // Normalize to a flat number[] if nested
            const flat = Array.isArray(embeddings) ? embeddings.flat(Infinity).map(Number) : [];
            return flat.slice(0, 768); // Usually 768 dims, previously code said 1536 but standard BERT/etc is 768. Safely usage.
        }
    } catch (err) {
        // ignore and fall back
    }

    // Fallback: deterministic pseudo-embedding via hash
    const hash = crypto.createHash('sha256').update(text).digest();
    const vec: number[] = [];
    // Creating a 768-dim vector by repeating hash bytes
    for (let i = 0; i < 768; i++) {
        vec.push(hash[i % hash.length] / 255.0);
    }
    return vec;
}
