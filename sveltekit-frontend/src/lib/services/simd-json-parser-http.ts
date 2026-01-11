const DEFAULT_ACCELERATOR_URL =
 import.meta.env?.VITE_SIMD_HTTP_ENDPOINT ?? 'https://localhost:8095/json';

/**
 * Call the HTTPS SIMD JSON accelerator.
 * Keeps payload as-is so the Go service can validate/echo the raw JSON.
 */
export async function parseJSONHTTP(payload: string): Promise<unknown> {
 const response = await fetch(DEFAULT_ACCELERATOR_URL, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: payload,
 });

 if (!response.ok) {
 const detail = await safeReadText(response);
 const message =
 `HTTP accelerator error: ${response.status} ${response.statusText}` +
 (detail ? ` — ${detail}` : '');
 throw new Error(message);
 }

 return response.json();
}

async function safeReadText(response: Response): Promise<string> {
 try {
 return await response.text();
 } catch {
 return '';
 }
}


