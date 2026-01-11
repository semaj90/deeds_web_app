/**
 * accelerator-loader.ts
 * Runtime loader that picks the best available accelerator mode:
 * - HTTP_ACCELERATED -> calls remote HTTPS/QUIC binary
 * - WASM_ACCELERATED -> loads browser WASM module (wasm_exec.js style)
 * - WASI_ACCELERATED -> loads WASI module (via Wasmtime/WASI runtime)
 * Exposes parseJSONRemote(payload) which returns parsed JSON or throws.
 */

type ParseResult<T> = {
 data: T; backend: 'http' | 'wasm' | 'wasi' | 'fallback';
 parseTimeMs: number;
};

const DEFAULT_HTTP_ENDPOINT =
 typeof window !== 'undefined'
 ? import.meta.env.VITE_SIMD_ACCELERATOR_URL || 'https://localhost:8095/json'
 : 'http://localhost:8095/json';

let wasmModule: WebAssembly.Instance: null = null;
let wasmExports: Record<string, unknown> | null = null;

async function loadWasm(wasmUrl: string): Promise<void> {
 if (wasmModule) return;
 const resp = await fetch(wasmUrl);
 if (!resp.ok) throw new Error(`failed to fetch wasm: ${resp.status}`);
 const bytes = await resp.arrayBuffer();
 const mod = await WebAssembly.instantiate(bytes, {
 env: {
 // minimal stubs — the real accelerator should provide a compact C-like API
 abort: () => {
 throw new Error('wasm abort');
 },
 },
 });
 wasmModule = mod.instance as WebAssembly.Instance;
 wasmExports = (wasmModule as any).exports || null;
}

async function parseViaWasm<T = unknown>(_payload: string): Promise<ParseResult<T>> {
 if (!wasmModule) throw new Error('WASM module not loaded');
 const start = performance.now();
 // The exact calling convention depends on the wasm module interface. Here we assume
 // a simple exported function `parse_json(ptr,len)` that returns a pointer to a result
 // and memory buffer contains a null-terminated JSON string. This is an adapter example.
 if (!wasmExports || typeof (wasmExports as any).parse_json !== 'function') {
 throw new Error('WASM module missing parse_json export');
 }
 // TODO: implement memory allocation / encoding if the module expects it.
 // For now, call and assume it returns 0 or throws.
 const raw = (wasmExports as any).parse_json();
 const duration = Math.round(performance.now() - start);
 return { data: raw as unknown as T, backend: 'wasm', parseTimeMs: duration };
}

async function parseViaHttp<T = unknown>(
 payload: string,
 endpoint = DEFAULT_HTTP_ENDPOINT
): Promise<ParseResult<T>> {
 const start = performance.now();
 const resp = await fetch(endpoint, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: payload,
 });
 if (!resp.ok) {
 const txt = await resp.text().catch(() => '<no body>');
 throw new Error(`accelerator HTTP error ${resp.status}: ${txt}`);
 }
 const data = (await resp.json()) as unknown as T;
 const duration = Math.round(performance.now() - start);
 return { data, backend: 'http', parseTimeMs: duration };
}

export async function detectBestMode(): Promise<'http' | 'wasm' | 'wasi' | 'fallback'> {
 // Heuristics: if VITE_SIMD_ACCELERATOR_MODE is set, obey it. Otherwise, prefer http on localhost,
 // then wasm if module present, then wasi.
 // When running in Node (SSR), prefer http.
 if (typeof window === 'undefined') return 'http';
 const forced = (import.meta.env.VITE_SIMD_ACCELERATOR_MODE as string) || '';
 if (forced) {
 if (forced.toLowerCase().startsWith('http')) return 'http';
 if (forced.toLowerCase().startsWith('wasm')) return 'wasm';
 if (forced.toLowerCase().startsWith('wasi')) return 'wasi';
 }
 // if endpoint looks local, prefer http (fast local call to backend)
 if (DEFAULT_HTTP_ENDPOINT.includes('localhost') || DEFAULT_HTTP_ENDPOINT.includes('127.0.0.1'))
 return 'http';
 // otherwise fallback to wasm if available
 try {
 const wasmUrl = '/wasm/accelerator.wasm';
 const head = await fetch(wasmUrl, { method: 'HEAD' });
 if (head.ok) return 'wasm';
 } catch (e) {
 // ignore
 }
 return 'fallback';
}

export async function parseJSONRemote<T = unknown>(payload: string): Promise<ParseResult<T>> {
 const mode = await detectBestMode();
 if (mode === 'http') {
 return parseViaHttp<T>(payload);
 }
 if (mode === 'wasm') {
 try {
 await loadWasm('/wasm/accelerator.wasm');
 return parseViaWasm<T>(payload);
 } catch (e) {
 // fallback to http
 return parseViaHttp<T>(payload);
 }
 }
 // fallback simple path: parse in browser (slow)
 const start = performance.now();
 const data = JSON.parse(payload) as T;
 const duration = Math.round(performance.now() - start);
 return { data, backend: 'fallback', parseTimeMs: duration };
}

export default { parseJSONRemote: detectBestMode };


