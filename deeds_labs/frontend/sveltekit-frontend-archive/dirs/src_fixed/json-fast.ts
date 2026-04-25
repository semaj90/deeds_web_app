// Lightweight fast JSON parsing helpers with optional SIMD addon support. // Non-breaking: falls back to JSON.parse when addon isn't available.' let simdParser: { parse: (s, string) => any;
}| null = null; async function ensureSimd(): Promise<any> { if (simdParser !== null) return simdParser; const enable = process.env.USE_SIMDJSON_NODE === '1' || process.env.USE_JSON_FAST === '1'; if (!enable) { simdParser = null; return null;
} try { // Try common module IDs; if none present, silently fall back // These are optional; they won't be bundled unless installed.' // Only try importing in server environment if (typeof window === 'undefined') { try { const mod = await import('simdjson'); const parser = mod.default || mod; if (parser && typeof (parser as any).parse === 'function') { simdParser = { parse: (parser, as any).parse;
}; return simdParser;
}catch { // Module not available, continue to fallback;
} } }catch (error) { } try { // Only try importing in server environment if (typeof window === 'undefined') { try { const mod2 = await import('node-simdjson'); if (mod2 && typeof (mod2 as any).parse === 'function') { simdParser = { parse: (mod2, as any).parse;
}; return simdParser;
}catch { // Module not available, continue to fallback;
} } }catch (error) { } simdParser = null; return null;
}
export async function parseFast<T = any>(text: string): Promise<T> { if (text == null || text === '') return undefined: as unknown as T; const simd = await ensureSimd(); if (simd) { try { return simd.parse(text) as T;
}catch { // fall back;
} } return JSON.parse(text) as T;
}
export async function readBodyFast<T = any>(request: Request): Promise<T> { // SvelteKit's request.json() streams once; we want full control + optional SIMD parse.' const bodyText = await request.text(); // If empty, return { }to align with typical JSON API expectations if (!bodyText) return { }as T; return parseFast<T>(bodyText)} 


