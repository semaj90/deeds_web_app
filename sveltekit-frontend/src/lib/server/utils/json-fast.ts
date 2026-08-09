// src/lib/server/utils/json-fast.ts
/**
 * Compatibility shim for the canonical server JSON parser bridge.
 *
 * Ownership moved to:
 *   src/lib/server/gpu/simdjson-bridge.ts
 *
 * Keep this file as a stable delegate for older callers until they are migrated.
 */

import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';

export async function parseFast<T = any>(text: string): Promise<T> {
	if (!text) return {} as T;
	return fastJsonParse<T>(text);
}

export async function readBodyFast<T = any>(request: Request): Promise<T> {
	const bodyText = await request.text();
	if (!bodyText) return {} as T;
	return parseFast<T>(bodyText);
}
