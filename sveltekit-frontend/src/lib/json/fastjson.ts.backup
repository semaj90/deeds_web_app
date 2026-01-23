/**
 * Phase52: Unified Ultra-Fast JSON Adapter
 *
 * Canonical JSON Parsing Hierarchy:
 * 1. Python SIMD/GPU Parser (fastest) - via agentic_bridge_service.py
 * 2. simdjson-node (C++ native SIMD) - for SvelteKit routes/backend
 * 3. UltraJSONParser TS (browser/WASM) - for frontend interactions
 * 4. JSON.parse (fallback) - native JavaScript
 *
 * This provides enterprise-grade JSON parsing with intelligent fallbacks
 * and GPU acceleration for legal document processing.
 */

import { parse as simdParse } from 'simdjson-node';

export interface FastJSONResult<T = any> {
    ok: boolean;
    data?: T;
    error?: string;
    backend: 'simd_gpu' | 'simd_cpu' | 'simdnode' | 'wasm' | 'native';
    ms: number;
    metadata?: {
        inputLength?: number;
        tokensProcessed?: number;
        gpuLayers?: number;
        batchSize?: number;
    };
}

/**
 * Try Python SIMD/GPU backend via agentic bridge service
 */
async function tryPythonSIMD(input: string): Promise<FastJSONResult> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const res = await fetch('http://localhost:8097/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ json: input }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`bridge returned ${res.status}`);

        const payload = await res.json();

        return {
            ok: true,
            data: payload.data,
            backend: payload.gpu ? 'simd_gpu' : 'simd_cpu',
            ms: payload.ms,
            metadata: {
                inputLength: input.length,
                tokensProcessed: payload.tokensProcessed,
                gpuLayers: payload.gpuLayers,
                batchSize: payload.batchSize,
            },
        };
    } catch (err: any) {
        return {
            ok: false,
            backend: 'simd_cpu',
            ms: 0,
            error: String(err),
            metadata: { inputLength: input.length },
        }
    }
}

/**
 * Try C++ SIMD backend via simdjson-node
 */
function trySIMDNode(input: string): FastJSONResult {
    const t0 = performance.now();
    try {
        const data = simdParse(Buffer.from(input));
        return {
            ok: true,
            data,
            backend: 'simdnode',
            ms: performance.now() - t0,
            metadata: {
                inputLength: input.length,
                tokensProcessed: Array.isArray(data) ? data.length : 1,
            },
        };
    } catch (err: any) {
        return {
            ok: false,
            backend: 'simdnode',
            ms: performance.now() - t0,
            error: String(err),
            metadata: { inputLength: input.length },
        }
    }
}

/**
 * Try WASM UltraJSONParser backend
 */
async function tryUltraJSON(input: string): Promise<FastJSONResult> {
    try {
        // Dynamic import to avoid bundling issues
        // Ensure path is correct relative to this file
        const { UltraJSONParser } = await import('../utils/ultra-json-parser.js');

        const t0 = performance.now();
        const data = UltraJSONParser.parse(input);
        const ms = performance.now() - t0;

        return {
            ok: true,
            data,
            backend: 'wasm',
            ms,
            metadata: {
                inputLength: input.length,
                tokensProcessed: Array.isArray(data) ? data.length : 1,
            },
        };
    } catch (err: any) {
        return {
            ok: false,
            backend: 'wasm',
            ms: 0,
            error: String(err),
            metadata: { inputLength: input.length },
        }
    }
}

/**
 * Fallback to native JSON.parse
 */
function tryNative(input: string): FastJSONResult {
    const t0 = performance.now();
    try {
        return {
            ok: true,
            data: JSON.parse(input),
            backend: 'native',
            ms: performance.now() - t0,
            metadata: { inputLength: input.length },
        };
    } catch (err: any) {
        return {
            ok: false,
            backend: 'native',
            ms: performance.now() - t0,
            error: String(err),
            metadata: { inputLength: input.length },
        }
    }
}

/**
 * Unified fast JSON parsing with intelligent backend selection
 *
 * Phase52: Automatically chooses the fastest available backend:
 * 1. Python SIMD/GPU (via agentic bridge)
 * 2. C++ SIMD (simdjson-node)
 * 3. WASM UltraJSONParser
 * 4. Native JSON.parse
 */
export async function fastjson<T = any>(input: string): Promise<FastJSONResult<T>> {
    if (!input || typeof input !== 'string') {
        return {
            ok: false,
            backend: 'native',
            ms: 0,
            error: 'Invalid input: must be non-empty string',
        };
    }

    // 1. Try Python SIMD/GPU backend (fastest for large legal documents)
    const py = await tryPythonSIMD(input);
    if (py.ok) return py as FastJSONResult<T>;

    // 2. Try C++ SIMD backend (excellent for SvelteKit routes)
    const sn = trySIMDNode(input);
    if (sn.ok) return sn as FastJSONResult<T>;

    // 3. Try WASM UltraJSONParser (good for browser interactions)
    const wasm = await tryUltraJSON(input);
    if (wasm.ok) return wasm as FastJSONResult<T>;

    // 4. Fall back to native JSON.parse (always works)
    return tryNative(input) as FastJSONResult<T>;
}

/**
 * Synchronous version for cases where async is not suitable
 * Uses SIMD backends that support sync parsing
 */
export function fastjsonSync<T = any>(input: string): FastJSONResult<T> {
    if (!input || typeof input !== 'string') {
        return {
            ok: false,
            backend: 'native',
            ms: 0,
            error: 'Invalid input: must be non-empty string',
        };
    }

    // Try C++ SIMD first (sync)
    const sn = trySIMDNode(input);
    if (sn.ok) return sn as FastJSONResult<T>;

    // Fall back to native (sync)
    return tryNative(input) as FastJSONResult<T>;
}

/**
 * Health check for all backends
 */
export async function checkBackends(): Promise<{
    pythonSIMD: boolean;
    simdNode: boolean;
    ultraJSON: boolean;
    native: boolean;
}> {
    const results = {
        pythonSIMD: false,
        simdNode: false,
        ultraJSON: false,
        native: true // Always available
    };

    // Test Python SIMD
    try {
        const res = await fetch('http://localhost:8097/health', { timeout: 2000 });
        results.pythonSIMD = res.ok;
    } catch {}

    // Test SIMD Node
    try {
        const test = trySIMDNode('{"test": true}');
        results.simdNode = test.ok;
    } catch {}

    // Test UltraJSON
    try {
        const test = await tryUltraJSON('{"test": true}');
        results.ultraJSON = test.ok;
    } catch {}

    return results;
}
