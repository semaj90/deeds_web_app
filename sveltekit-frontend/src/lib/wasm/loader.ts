/**
 * Phase 35: WASM Module Loader
 * Centralized loader with caching and error handling
 */

import { browser } from '$app/environment';

const wasmCache = new Map<string, WebAssembly.Instance>();

export interface WasmLoadOptions {
 cache?: boolean;
 timeout?: number;
 retries?: number;
}

export class WasmLoader {
 private static instance: WasmLoader;

 private constructor() {}

 static getInstance(): WasmLoader {
 if (!WasmLoader.instance) {
 WasmLoader.instance = new WasmLoader();
 }
 return WasmLoader.instance;
 }

 async load<T = any>(
 path: string, imports: WebAssembly.Imports = {},
 options: WasmLoadOptions = {}
 ): Promise<T> {
 if (!browser) {
 throw new Error('WASM modules can only be loaded in browser');
 }

 const { cache = true, timeout = 10000, retries = 3 } = options;

 // Check cache
 if (cache && wasmCache.has(path)) {
 return wasmCache.get(path)!.exports as T;
 }

 // Load with retries
 let lastError: Error | null = null;
 for (let i = 0; i < retries; i++) {
 try {
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), timeout);

 const response = await fetch(path, { signal: controller.signal });
 clearTimeout(timeoutId);

 if (!response.ok) {
 throw new Error(`HTTP ${response.status}: ${response.statusText}`);
 }

 const buffer = await response.arrayBuffer();
 const result = await WebAssembly.instantiate(buffer, imports);

 if (cache) {
 wasmCache.set(path, result.instance);
 }

 return result.instance.exports as T;
 } catch (err) {
 lastError = err as Error;
 if (i < retries - 1) {
 await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
 }
 }
 }

 throw new Error(`Failed to load WASM module ${path}: ${lastError?.message}`);
 }

 clearCache(path?: string) {
 if (path) {
 wasmCache.delete(path);
 } else {
 wasmCache.clear();
 }
 }

 getCacheSize(): number {
 return wasmCache.size;
 }
}

export const wasmLoader = WasmLoader.getInstance();

