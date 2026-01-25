// Thin wrapper around simdjson (or a fast JSON parse fallback)
// We keep API simple to swap implementations later.

export async function parseJSONFast<T = unknown>(input: string | Buffer): Promise<T> {
    try {
        // Try simdjson if available (can be disabled via env)
        if (process.env.SIMDJSON_DISABLED !== '1') {
            const simd = await import('simdjson');
            if (simd?.parse) {
                // simdjson.parse handles Buffer and string
                return simd.parse(input) as T;
            }
        }
    } catch (error) {
        // Fallback to JSON.parse
    }

    const str = typeof input === 'string' ? input : input.toString('utf8');
    return JSON.parse(str) as T;
}
