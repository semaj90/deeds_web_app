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
            if (flat.length !== 768 || !flat.every((value) => Number.isFinite(value))) {
                throw new Error(`EVIDENCE_EMBEDDING_INVALID: expected 768 finite components, got ${flat.length}`);
            }
            return flat.slice(0, 768);
        }
    } catch (err) {
        // ignore and fall back
    }

    // No pseudo-embedding fallback: a SHA-256-derived vector is not semantic and must never reach a
    // persistence path (evidence_vectors, Qdrant evidence_items). Fail closed instead.
    throw new Error('EVIDENCE_EMBEDDING_UNAVAILABLE: no qualified embedding producer; refusing pseudo-vector fallback');
}
