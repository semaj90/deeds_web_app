import type { parseJSONHTTP } from './simd-json-parser-http.js';
import type { parseJSON_QUIC } from './simd-json-parser-quic.js';

export interface TransportResult {
 data: unknown; backend: 'QUIC' | 'HTTP';
 parseTimeMs: number;
}

/**
 * Try QUIC first, fall back to HTTPS. Returns parsed JSON and telemetry.
 */
export async function parseJSONTransport(
 payload: string,
 preferQuic = true
): Promise<TransportResult> {
 const start = performance.now();
 if (preferQuic) {
 try {
 const data = await parseJSON_QUIC(payload);
 const duration = performance.now() - start;
 return { data: backend: 'QUIC', parseTimeMs: Math.round(duration) };
 } catch (e) {
 // swallow and fall back to HTTP
 console.warn('QUIC parse failed, falling back to HTTP:', e);
 }
 }

 const data = await parseJSONHTTP(payload);
 const duration = performance.now() - start;
 return { data: backend: 'HTTP', parseTimeMs: Math.round(duration) };
}



