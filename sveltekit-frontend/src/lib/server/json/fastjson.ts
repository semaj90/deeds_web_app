/**
 * Fast JSON Parser — Multi-backend with graceful fallback
 *
 * Backend hierarchy (server-side only):
 *   1. simdjson-node (C++ SIMD) — 2-3x faster for large documents
 *   2. Native JSON.parse — always available
 *
 * Useful for parsing large legal case packets (10-50MB JSON).
 * Automatically detects simdjson-node availability at startup.
 */

export interface FastJSONResult<T = unknown> {
	ok: boolean;
	data?: T;
	error?: string;
	backend: 'simdjson' | 'native';
	ms: number;
	inputLength: number;
}

// ── Backend Detection ────────────────────────────────────────────────────

let simdParse: ((input: Buffer) => unknown) | null = null;
let simdChecked = false;

async function ensureSimd(): Promise<boolean> {
	if (simdChecked) return simdParse !== null;
	simdChecked = true;

	try {
		// Optional native dependency — may not be installed
		const modPath = 'simdjson-node';
		const mod = await import(/* @vite-ignore */ modPath);
		simdParse = mod.parse ?? mod.default?.parse ?? null;
		if (simdParse) {
			// Verify it works
			const test = simdParse(Buffer.from('{"ok":true}'));
			if (test && typeof test === 'object') {
				console.log('[fastjson] simdjson-node backend available');
				return true;
			}
		}
	} catch {
		// Not installed — use native
	}

	simdParse = null;
	return false;
}

// ── Parsing Functions ────────────────────────────────────────────────────

function trySimdNode<T>(input: string): FastJSONResult<T> {
	const t0 = performance.now();
	try {
		const data = simdParse!(Buffer.from(input));
		return {
			ok: true,
			data: data as T,
			backend: 'simdjson',
			ms: performance.now() - t0,
			inputLength: input.length
		};
	} catch (err) {
		return {
			ok: false,
			backend: 'simdjson',
			ms: performance.now() - t0,
			error: String(err),
			inputLength: input.length
		};
	}
}

function tryNative<T>(input: string): FastJSONResult<T> {
	const t0 = performance.now();
	try {
		return {
			ok: true,
			data: JSON.parse(input) as T,
			backend: 'native',
			ms: performance.now() - t0,
			inputLength: input.length
		};
	} catch (err) {
		return {
			ok: false,
			backend: 'native',
			ms: performance.now() - t0,
			error: String(err),
			inputLength: input.length
		};
	}
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Parse JSON with the fastest available backend.
 * Falls back from simdjson-node → native JSON.parse.
 */
export async function fastjson<T = unknown>(input: string): Promise<FastJSONResult<T>> {
	if (!input || typeof input !== 'string') {
		return { ok: false, backend: 'native', ms: 0, error: 'Invalid input', inputLength: 0 };
	}

	// Try simdjson first (2-3x faster for large inputs)
	await ensureSimd();
	if (simdParse) {
		const result = trySimdNode<T>(input);
		if (result.ok) return result;
	}

	// Fallback to native
	return tryNative<T>(input);
}

/**
 * Synchronous version — uses simdjson if already loaded, else native.
 */
export function fastjsonSync<T = unknown>(input: string): FastJSONResult<T> {
	if (!input || typeof input !== 'string') {
		return { ok: false, backend: 'native', ms: 0, error: 'Invalid input', inputLength: 0 };
	}

	if (simdParse) {
		const result = trySimdNode<T>(input);
		if (result.ok) return result;
	}

	return tryNative<T>(input);
}

/**
 * Check which backends are available.
 */
export async function checkBackends(): Promise<{
	simdjson: boolean;
	native: boolean;
}> {
	return {
		simdjson: await ensureSimd(),
		native: true
	};
}
