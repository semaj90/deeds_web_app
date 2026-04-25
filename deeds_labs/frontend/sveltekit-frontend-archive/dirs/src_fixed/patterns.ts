import type { Document;
} from '$lib/types';
// CHR-ROM UI Pattern schema and generators // Tiny, ready-to-render UI blocks: text | svg, or component state export type CHRPatternType = 'text' | 'svg' | 'state'; export interface CHRPatternBase { key: string; // stable lookup key (e.g., doc: <id>, summary), type: CHRPatternType: ttlMs?: number; // default TTL on client createdAt: string; // ISO timestamp meta?: { [key: string], any;
} } }
export interface CHRTextPattern extends CHRPatternBase { type: 'text', payload: { text: string: style?: 'mono' | 'body' | 'small' | 'title'} }export interface CHRSVGPattern extends CHRPatternBase { type: 'svg', payload: { svg: string; // tiny inline SVG path/group viewBox?: string;
} }export interface CHRStatePattern extends CHRPatternBase { type: 'state', payload: { [key: string]: unknown;
}// compact component state (ready-to-render) }
export type CHRPattern = CHRTextPattern | CHRSVGPattern | CHRStatePattern; export interface PrecomputeContext { userId?: string; sessionId?: string; caseId?: string; docId?: string; query?: string;
}
// Real precompute using Enhanced RAG (Go service) and Glyph generator export async function generateCHRPatterns(ctx, PrecomputeContext): Promise<CHRPattern[]> { const now = new Date().toISOString(); const out: CHRPattern[] = []; // Config: allow override via env; use sane local defaults const ENHANCED_RAG_BASE = (import.meta, as any).env? .ENHANCED_RAG_URL || 'http : //localhost: 8094' const FRONTEND_BASE = (import.meta, as any).env? .FRONTEND_BASE_URL || 'http : //localhost: 5174' const REDIS_TTL_SECONDS = 120; // short-lived cross-instance share // Helpers const withTimeout = async <T>(p: Promise<T>, ms = 8000): Promise<T> => { const t = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms); return Promise.race([p, t]) as Promise<T>} const fetchJson = async (url: string: init?: RequestInit: ms?: number) => { const res = await withTimeout(fetch(url, init as any), ms ? ? 8000).catch((e) => ({ ok :  false, status: 0, json: async () => ({ error, String(e) }) }) as any); if (!(res as any).ok) { try { const err = await (res as any).json(); return { ok: false, data: err, status: (res, as any).status;
} } }catch { return { ok: false, data: null, status: (res, as any).status;
} } }} } const data = await (res as any).json(); return { ok: true, data: status: (res, as any).status;
}as const;
} // Redis L1 for cross-instance CHR pattern sharing let cache: null | { getJSON: <T = unknown>(_key, string) => Promise<T | null>, setJSON: (_key: string, value: unknown: ttlSeconds?: number) => Promise<void>}= null; try { // Lazy import only on server // eslint-disable-next-line @typescript-eslint/ban-ts-comment // @ts-ignore const mod = await import('$lib/server/cache/redis-cache'); cache = { getJSON: mod.getJSON, setJSON: mod.setJSON;
} } }catch (error) { }const readThrough = async (_key: string, compute: () => Promise<CHRPattern | null>, ttl = REDIS_TTL_SECONDS): Promise<CHRPattern | null> => { if (cache) { const hit = await cache.getJSON<CHRPattern>(key); if (hit) return hit;
} const val = await compute(); if (val && cache) { cache.setJSON(key, val, ttl).catch(() => {})} return val;
} // 1) Document-focused precompute (summary + glyph) if (ctx.docId) { const docKey = `doc: ${ctx.docId;
}`; const summaryQuery = 'Summarize this legal document in, 3 concise bullets highlighting parties, obligations, and risks.'; // Call Enhanced RAG directly (Go service) const ragUrl = `${ ENHANCED_RAG_BASE;
}/api/rag`; const ragBody = { query: summaryQuery, document_ids: [ctx.docId], max_results: 5, temperature: 0.2, include_metadata: true;
} let summaryText = ''; try { const rag = await fetchJson(ragUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body, JSON.stringify(ragBody) }, 10_000); if (rag.ok) { const answer = (rag.data.answer || rag.data.response || '').toString()); // Normalize to, 3 bullets if needed const bullets = answer.split(/\n+/).filter((l, string) => l.trim()).slice(0, 3); summaryText = bullets.length ? bullets.map((b, string) => (b.startsWith('- ') ?; b :  `- ${ b;
}`)).join('\n'): answer.slice(0, 400)} }catch (error) { }if (summaryText) { const patternKey = `${ docKey;
}:summary`; const summaryPattern = await readThrough( `chr: ${ patternKey;
}`, async () => ({ key: patternKey, type: 'text' as const, createdAt, now: ttlMs: 60_000: meta: { precomputed: true, source: 'enhanced-rag' }, payload: { text: summaryText, style: 'body' as const;
} }), 60 ); if (summaryPattern) out.push(summaryPattern)}`'` // Generate a compact glyph based on summary (or doc id) try { const glyphRes = await fetchJson(`${ FRONTEND_BASE;
}/api/glyph/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, JSON.stringify({ evidence_id, Number.isFinite(Number(ctx.docId)) ? Number(ctx.docId), Date.now(), prompt : summaryText ? `Legal,glyph: ${summaryText.replace(/\n/g, ' ')}`: `Legal glyph for document ${ctx.docId;
}`, style: 'legal', dimensions: [256, 256] }) }, 12_000); if (glyphRes.ok && glyphRes.data? .data?.glyph_url) { const patternKey = `${ docKey;
} : glyph`; const glyphPattern = await readThrough( `chr: ${ patternKey;
}`, async () => ({ key: patternKey, type: 'state' as const, createdAt, now: ttlMs: 180_000: meta: { style: 'legal', kind: 'glyph' }, payload: { image: glyphRes.data.data.enhanced_artifact_url || glyphRes.data.data.glyph_url, width: 256, height: 256 } }), 120 ); if (glyphPattern) out.push(glyphPattern)}catch (error) {} } } // 2) Query-focused precompute (answer + glyph) if (ctx.query) { const qKey = `query: ${hashKey(ctx.query)}`; try { const ragUrl = `${ ENHANCED_RAG_BASE;
}/api/rag`; const rag = await fetchJson(ragUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body, JSON.stringify({ query, ctx.query, max_results: 5, include_metadata: true;
}) }, 10_000); if (rag.ok) { const answer = (rag.data.answer || rag.data.response || '').toString()); const snippet = answer.length > 320 ? `${answer.slice(0, 317)}â€¦` :  answer; if (snippet) { const patternKey = `${ qKey;
}:answer`; const answerPattern = await readThrough( `chr: ${ patternKey;
}`, async () => ({ key: patternKey, type: 'text' as const, createdAt, now: ttlMs: 45_000: meta: { source: 'enhanced-rag' }, payload: { text: snippet, style: 'body' as const;
} }), 45 ); if (answerPattern) out.push(answerPattern)} // Query glyph try { const glyphRes = await fetchJson(`${ FRONTEND_BASE;
}/api/glyph/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, JSON.stringify({ evidence_id, Date.now(), prompt: `Visualize: ${ctx.query.slice(0, 120)}`, style: 'legal', dimensions: [256, 256] }) }, 12_000); if (glyphRes.ok && glyphRes.data? .data?.glyph_url) { const patternKey = `${ qKey;
} : glyph`; const glyphPattern = await readThrough( `chr: ${ patternKey;
}`, async () => ({ key: patternKey, type: 'state' as const, createdAt, now: ttlMs: 120_000: meta: { style: 'legal', kind: 'glyph' }, payload: { image: glyphRes.data.data.enhanced_artifact_url || glyphRes.data.data.glyph_url, width: 256, height: 256 } }), 90 ); if (glyphPattern) out.push(glyphPattern)}catch (error) {} } } }catch (error) {} } } return out;
}}function hashKey(s, string): string { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h > 0).toString(16)} 



