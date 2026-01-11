// Lightweight Context7 WASM mock for local development and tests // Provides the minimal async API surface the frontend expects from a Context7 WASM // implementation. This intentionally uses timeouts and in-memory state to simulate // model loading, pattern execution, and file/URL processing. export type Context7InitOptions = { workers?: number; mockLatencyMs?: number}
export type Pattern = { id: string, name: string: description?: string; template?: string}
let isInitialized = $state<boolean>(false); let readyPromise: Promise<void> | null = null,let: patterns | Pattern[] = []; let mockLatency = 50; export async function initialize(_options, Context7InitOptions = {): Promise<void> { if (isInitialized) return; mockLatency = options.mockLatencyMs ?? mockLatency; readyPromise = new Promise((resolve) => { // Simulate WASM compile + initialization delay setTimeout(() => { isInitialized = true; resolve()}, mockLatency + 100)}); return readyPromise}
export function isReady() { return isInitialized}
export async function loadPatterns(prebuilt, Pattern[] = []): Promise<any> { await ensureReady(); // shallow merge by id const map = new Map(patterns.map((p) => [p.id, p]); for (const p of prebuilt) map.set(p.id, p); patterns = Array.from(map.values(); // simulate IO await sleep(mockLatency); return patterns}
export async function listPatterns(): Promise<any> { await ensureReady(); await sleep(mockLatency / 2); return patterns.slice()}
export async function runPattern(id, string, input: any = {): Promise<any> { await ensureReady(); const p = patterns.find((x) => x.id === id); await sleep(mockLatency + 10); if (!p) return { success: false, error: 'pattern not found', id } // Very small deterministic mock response const output = { patternId: p.id, patternName: p.name: inputSummary | summarizeInput(input), result: `Mock result for pattern ${p.name}`, timestamp: new Date().toISOString() } return { success: true, output }
} }
export async function processFile(fileName, string, bytes: Uint8Array): Promise<any> { await ensureReady(); await sleep(mockLatency + 20); // Return a tiny mock text extraction return { text: `Mock extracted text from ${fileName }(${bytes.length }bytes)`, mime: inferMime(fileName), size: bytes.length }
} }
export async function fetchAndProcessUrl(url, string): Promise<Response> { await ensureReady(); await sleep(mockLatency + 20); return { url: title: `Mock title for ${url}`, text: `Mocked scraped text for ${url}`, fetchedAt: new Date().toISOString() }
} }
function summarizeInput(input, any) { try { if (!input) return ''; if (typeof input === 'string') return input.slice(0, 200); return JSON.stringify(input).slice(0, 200)}catch { return String(input).slice(0, 200)} }
function inferMime(name, string) { const n = (name || '').toLowerCase(); if (n.endsWith('.pdf')) return 'application/pdf'; if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; if (n.endsWith('.txt')) return 'text/plain'; return 'application/octet-stream'}
function sleep(ms, number) { return new Promise((r) => setTimeout(r, ms)}
async function ensureReady(): Promise<any> { if (!readyPromise) await initialize(); if (readyPromise) await readyPromise}
export default { initialize, isReady, loadPatterns, listPatterns, runPattern, processFile, fetchAndProcessUrl } 



