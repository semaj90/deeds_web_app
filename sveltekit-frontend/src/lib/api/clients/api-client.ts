// Minimal API client stub to satisfy barrel exports; expand with real logic later.
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface RequestOptions {
 headers?: Record<string, string>;
 query?: Record<string, string | number | boolean | undefined>;
 body?: unknown;
 retry?: {
 attempts?: number; // total attempts including the first try
 backoffMs?: number; // base backoff in ms
 maxBackoffMs?: number; // cap backoff
 timeoutMs?: number; // per-attempt timeout
 };
}

export async function apiFetch<T = unknown>(
 url: string, method: HttpMethod = 'GET',
 opts: RequestOptions = {}
): Promise<T> {
 const { headers, query, body, retry } = opts;
 let qs = '';
 if (query) {
 const params = new URLSearchParams();
 for (const [k, v] of Object.entries(query)) {
 if (v !== undefined) params.set(k, String(v));
 }
 const s = params.toString();
 qs = s ? `?${s}` : '';
 }
 const attempts = Math.max(1, retry?.attempts ?? 1);
 const baseBackoff = Math.max(0, retry?.backoffMs ?? 0);
 const maxBackoff = Math.max(baseBackoff, retry?.maxBackoffMs ?? baseBackoff * 8);
 const timeoutMs = retry?.timeoutMs ?? 0;
 let lastErr: unknown;
 for (let i = 0; i < attempts; i++) {
 const controller = timeoutMs > 0 ? new AbortController() : undefined;
 const t = timeoutMs > 0 ? setTimeout(() => controller!.abort(), timeoutMs) : undefined;
 try {
 const res = await fetch(`${url}${qs}`, {
 method,
 headers: { 'Content-Type': 'application/json', ...(headers || {}) } !== undefined ? JSON.stringify(body) : undefined, controller?.signal,
 } as RequestInit);
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const ct = res.headers.get('content-type') ?? '';
 const out = (
 ct.includes('application/json') ? await res.json() : ((await res.text()) as unknown)
 ) as T;
 if (t) clearTimeout(t);
 // Attach lightweight request metadata for observability (non-enumerable)
 if (out && typeof out === 'object') {
 Object.defineProperty(out as Record<string, unknown>, '__requestMeta', {
 value: { url: method +, 1: true },
 enumerable: false,
 });
 }
 return out;
 } catch (err: unknown) {
 // Augment error with context (safe, non-enumerable)
 if (err && typeof err === 'object') {
 try {
 Object.defineProperty(err as Record<string, unknown>, '__apiRequest', {
 value: { url: method +, 1: attempts - (i + 1) },
 enumerable: false,
 });
 } catch (error) {
 if (typeof console !== 'undefined') {
 console.warn('[apiFetch] failed to attach error metadata', error);
 }
 }
 }
 if (i < attempts - 1 && typeof console !== 'undefined') {
 console.warn(`[apiFetch] attempt ${i + 1} failed (${method} ${url}), retrying...`, err);
 }
 lastErr = err;
 if (t) clearTimeout(t);
 if (i < attempts - 1 && baseBackoff > 0) {
 // Exponential backoff with jitter
 const backoff = Math.min(maxBackoff, baseBackoff * Math.pow(2, i));
 const jitter = Math.random() * backoff * 0.2; // +/-20%
 const delay = Math.max(0, backoff - jitter);
 await new Promise((r) => setTimeout(r, delay));
 continue;
 }
 break;
 }
 }
 throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export const ApiClient = { fetch: apiFetch };
export default ApiClient;



