import Fuse, { type IFuseOptions } from 'fuse.js';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { browser } from '$app/environment';

export interface LocalLegalDoc {
    id: string;
	title: string;
    content: string;
	type: string;
    status: string;
    metadata?: Record<string, any>;
}

let fuse: Fuse<LocalLegalDoc> | null = null;
let documents: LocalLegalDoc[] = [];
let loadedFromCache = false;
const cacheKey = 'yorha-local-doc-index-v1';

const options: IFuseOptions<LocalLegalDoc> = {
    keys: [
        { name: 'title', weight: 0.4 },
	{ name: 'content', weight: 0.3 },
	{ name: 'metadata.summary', weight: 0.2 },
	{ name: 'type', weight: 0.1 }
    ],
    includeScore: true,
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 3,
    useExtendedSearch: true
};

export function isLocalIndexReady() {
    return !!fuse;
}

export async function ensureLocalIndex(
    fetcher: typeof fetch = fetch,
    limit = 750
): Promise<Fuse<LocalLegalDoc> | null> {
    if (!browser) return null;
    if (fuse) return fuse; // already built

    // Try cache first
    try {
        const cached = await idbGet(cacheKey);
        if (cached && Array.isArray(cached) && cached.length > 0) {
            documents = cached;
            fuse = new Fuse(documents, options);
            loadedFromCache = true;
            return fuse;
        }
    } catch (e) {
        console.warn('[LocalSearch] Failed to load cache', e);
    }

    try {
        const res = await fetcher(`/api/yorha/legal-data?limit=${limit}`);
        if (res.ok) {
            const data = await res.json();
            const raw = (data as any).results || (data as any).documents || [];

            documents = raw.map((d: any, i: number) => ({
                id: d?.id || d?.uuid || `doc_${i + 1}`,
                title: d?.title || d?.name || `Document ${i + 1}`,
                content: d?.content || d?.text || d?.body || '',
                type: d?.type || d?.category || 'Legal Document',
                status: d?.status || 'active',
                metadata: d,
            }));

            fuse = new Fuse(documents, options);

            // Persist
            try {
                await idbSet(cacheKey, documents);
            } catch (err) {
                console.warn('[LocalSearch] Cache save failed', err);
            }
        } else {
            fuse = new Fuse([], options);
        }
    } catch (e) {
        console.warn('Local index build failed', e);
        fuse = new Fuse([], options);
    }
    return fuse;
}

export interface SearchResult extends LocalLegalDoc {
    relevance: number;
    source?: 'local' | 'remote' | 'hybrid';
}

export function localSearch(query: string, limit = 50): SearchResult[] {
    if (!fuse || !query.trim()) return [];

    return fuse
        .search(query)
        .slice(0, limit)
        .map((r): SearchResult => ({
            ...r.item,
            relevance: Math.round((1 - (r.score ?? 0)) * 100),
            source: 'local'
        }));
}

// Merge helper: combine local + remote results with weighting & dedupe
export interface HybridResult extends SearchResult {}

export function mergeResults(
    local: any[],
    remote: any[],
    localWeight = 0.6,
    remoteWeight = 0.4
): HybridResult[] {
    const byId = new Map<string, HybridResult>();

    for (const l of local) {
        const doc: HybridResult = {
            ...l,
            relevance: l.relevance ?? 50,
            source: 'local'
        };
        byId.set(String(doc.id), doc);
    }

    for (const r of remote) {
        if (!r) continue;
        const id = String(r.id || r.document_id || r.documentId);
        const existing = byId.get(id);

        let remoteRelevance = 0;
        if (typeof r.score === 'number') {
            remoteRelevance = r.score <= 1 ? Math.round(r.score * 100) : r.score; // normalize logic
        } else if (typeof r.relevance === 'number') {
            remoteRelevance = r.relevance;
        }

        const remoteDoc: HybridResult = {
            id: id,
            title: r.title || r.name || 'Unknown',
            content: r.content || r.text || '',
            type: r.type || 'remote',
            status: r.status || 'unknown',
            metadata: r.metadata || r,
            relevance: remoteRelevance,
            source: 'remote'
        };

        if (existing) {
            const combined = Math.round(existing.relevance * localWeight + remoteRelevance * remoteWeight);
            byId.set(id, {
                ...existing,
                ...remoteDoc,
                relevance: combined,
                source: 'hybrid'
            });
        } else {
            byId.set(id, remoteDoc);
        }
    }

    return Array.from(byId.values()).sort((a, b) => b.relevance - a.relevance);
}

export function addOrUpdateDocuments(newDocs: LocalLegalDoc[]) {
    // Simple replace strategy for now could do incremental updates later
    documents = newDocs;
    fuse = new Fuse(documents, options);
    void idbSet(cacheKey, documents);
}

export function appendDocuments(newDocs: LocalLegalDoc[]) {
    documents.push(...newDocs);
    fuse = new Fuse(documents, options);
    void idbSet(cacheKey, documents);
}

export function getLocalDocumentCount() {
    return documents.length;
}

export function clearLocalIndex() {
    documents = [];
    fuse = new Fuse([], options);
    void idbSet(cacheKey, documents);
}

export function wasLoadedFromCache() {
    return loadedFromCache;
}
