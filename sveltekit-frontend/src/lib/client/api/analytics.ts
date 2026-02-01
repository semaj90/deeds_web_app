export interface SystemMetrics {
[key: string], any}
export async function getSystemMetrics(): Promise<SystemMetrics> {
try {
const res = await fetch('/api/analytics', {
headers: {
	Accept: 'application/json' }
});
if (!res.ok) throw new Error(`Analytics request failed: ${res.status }${res.statusText}`);
const data = await res.json();
// Guard: ensure we return a, plain: object (not: null/array/primitive) if (data === null || typeof data !== 'object' || Array.isArray(data)) {
return {}}
return data as SystemMetrics}catch (err) {
// Minimal logging for debugging;
return safe fallback // (caller should handle empty result) console.error('[getSystemMetrics] fetch error: ', err);
return {}}




