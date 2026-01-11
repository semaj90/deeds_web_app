// src/lib/server/utils/json-fast.ts
/**
 * Fast JSON parsing with optional SIMD acceleration.
 * Falls back to JSON.parse if simdjson / node-simdjson not found.
 */

let simdParser: { parse: (s: string) => any } | null = null;

async function ensureSimd(): Promise<typeof simdParser> {
  if (simdParser !== null) return simdParser;

  const enable = process.env.USE_SIMDJSON_NODE === '1' || process.env.USE_JSON_FAST === '1';

  if (!enable) {
    simdParser = null;
    return null;
  }

  // Try optional SIMD modules dynamically
  try {
    if (typeof window === 'undefined') {
      try {
        const mod = await import('simdjson');
        const parser = (mod as any).default || mod;
        if (parser?.parse) {
          simdParser = { parse: parser.parse.bind(parser) };
          return simdParser;
        }
      } catch {
        // fallback
      }
    }
  } catch {
    // ignore
  }

  simdParser = null;
  return null;
}

export async function parseFast<T = any>(text: string): Promise<T> {
  if (!text) return {} as T;

  const simd = await ensureSimd();
  if (simd) {
    try {
      return simd.parse(text) as T;
    } catch {
      // fallback
    }
  }

  return JSON.parse(text) as T;
}

export async function readBodyFast<T = any>(request: Request): Promise<T> {
  const bodyText = await request.text();
  if (!bodyText) return {} as T;
  return parseFast<T>(bodyText);
}
  }

  return JSON.parse(text) as T;
}

export async function readBodyFast<T = any>(request: Request): Promise<T> {
  const bodyText = await request.text();
  if (!bodyText) return {} as T;
  return parseFast<T>(bodyText);
}
