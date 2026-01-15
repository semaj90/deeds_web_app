// Minimal in-memory SSE bus for CHR-ROM patterns import type { CHRPattern } from './patterns.js'; type WritableClient = { write: (chunk: string) => void }; const clients = new Set<WritableClient>(); export function addClient(c: WritableClient) { clients.add(c)}
export function removeClient(c: WritableClient) { clients.delete(c)}
export function broadcastPatterns(patterns: CHRPattern[]) { if (clients.size === 0) return; const payload = JSON.stringify(patterns); const event = `event: chrrom\ndata: ${payload}\n\n`; for (const c of clients) { try { c.write(event)}catch (error) { } }
} }


