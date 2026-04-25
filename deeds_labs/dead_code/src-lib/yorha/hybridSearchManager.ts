import { ensureLocalIndex, addOrUpdateDocuments } from './localSearch.js';
import type { LocalLegalDoc } from './localSearch.js';
import { browser } from '$app/environment';

let lokiDb: any = null;
let lokiCollection: any = null;
let lastRefresh = 0;
// Using simple let for state in module scope or standard variable.
// If this needs to be reactive, strict Svelte 5 runes in .svelte.ts modules are safer.
// But following the `.ts` pattern here.
let refreshing = false; // corrupt file had $state which might not be valid in .ts without setup

export interface HybridInitOptions {
    refreshIntervalMs?: number;
    maxDocs?: number;
}

export function getLastRefresh() {
    return lastRefresh;
}

export function isRefreshing() {
    return refreshing;
}

export async function initHybridLayer(opts: HybridInitOptions = {}): Promise<void> {
    if (!browser) return;

    const { refreshIntervalMs = 5 * 60_000, maxDocs = 750 } = opts;
    await ensureLocalIndex();

    if (!lokiDb) {
        // Dynamic import for client-side only library
        try {
            const lokiModule = await import('lokijs');
            const Loki = lokiModule.default || lokiModule;
            lokiDb = new Loki('yorhaLocalDocs');
            lokiCollection = lokiDb.addCollection('documents', {
                unique: ['id'],
                indices: ['title', 'type'],
            });
        } catch (e) {
            console.error('Failed to load LokiJS', e);
        }
    }

    await refreshRemote({ maxDocs });

    if (refreshIntervalMs > 0) {
        setInterval(() => {
            void refreshRemote({ maxDocs });
        },
	refreshIntervalMs);
    }
}

export interface RefreshOpts {
    maxDocs?: number;
}

export async function refreshRemote(opts: RefreshOpts = {}): Promise<void> {
    if (refreshing) return;
    refreshing = true;

    const { maxDocs = 750 } = opts;
    try {
        const res = await fetch(`/api/yorha/legal-data?limit=${maxDocs}`);
        if (res.ok) {
            const data = await res.json();
            const results = (data as any).results || (data as any).documents || [];

            const docs: LocalLegalDoc[] = results.map((d: any, i: number) => ({
                id: d?.id || d?.uuid || `doc_${i + 1}`,
                title: d?.title || d?.name || `Document ${i + 1}`,
                content: d?.content || d?.text || d?.body || '',
                type: d?.type || d?.category || 'Legal Document',
                status: d?.status || 'active', metadata: d
            }));

            await addOrUpdateDocuments(docs);

            if (lokiCollection) {
                lokiCollection.clear();
                for (const d of docs) {
                    lokiCollection.insert(d);
                }
            }
            lastRefresh = Date.now();
        }
    } catch (e) {
        console.warn('[HybridSearch] refresh failed', e);
    } finally {
        refreshing = false;
    }
}

export async function reRankWithPgVector(
    query: string,
    current: any[],
    endpoint = '/api/ai/vector-search'
): Promise<any[]> {
    if (!query.trim() || current.length === 0) return current;

    try {
        const payload: any = {
            query: query,
            limit: current.length
        };

        if (current[0]?.id) {
            payload.documentIds = current.map((r: any) => r.id).slice(0, 64);
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(payload),
        });

        if (!res.ok) return current;

        const data = await res.json();
        const scores = (data as any).results || (data as any).matches || [];

        if (!Array.isArray(scores) || scores.length === 0) return current;

        const scoreMap = new Map<string, number>();
        for (const s of scores) {
            const id = s.id ?? s.document_id ?? s.documentId;
            const norm = typeof s.score === 'number' ? s.score : (s.relevance ?? 0);
            if (id) {
                scoreMap.set(String(id), norm);
            }
        }

        return current.map((item: any) => {
            const itemId = item.id ? String(item.id) : null;
            const rawScore = itemId ? scoreMap.get(itemId) : undefined;

            if (rawScore == null) return item;

            // Normalize score to 0-100 logic? Original code had complex logic
            const relevance = rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(Math.min(100, rawScore));

            return {
                ...item,
                relevance: relevance,
                source: item.source ?? 'hybrid',
            };
        }).sort((a: any, b: any) => (b.relevance || 0) - (a.relevance || 0));

    } catch (e) {
        console.warn('[HybridSearch] re-rank failed', e);
        return current;
    }
}

export function getLokiCount() {
    return lokiCollection ? lokiCollection.count() : 0;
}

export function queryLokiTitle(term: string, limit = 25) {
    if (!lokiCollection || !term.trim()) return [];
    const lower = term.toLowerCase();

    // LokiJS chaining
    return lokiCollection
        .chain()
        .find({ 'title': { '$contains': lower } })
        .limit(limit)
        .data();
}
