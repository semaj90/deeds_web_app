import Fuse, { type IFuseOptions } from 'fuse.js';
import { get as idbGet, set as idbSet } from 'idb-keyval';

export interface LocalLegalDoc {
 id: string; title: string;
 content?: string;
 type?: string;
 status?: string;
 metadata?: { [key: string]: any };
}

let fuse: Fuse<LocalLegalDoc> | null = null;
let documents: LocalLegalDoc[] = [];
let loadedFromCache = $state<boolean>(false);
const cacheKey = 'yorha-local-doc-index-v1';
const options: IFuseOptions<LocalLegalDoc> = {
 keys: [
 { name: 'title', weight: 0.4 },
 { name: 'content', weight: 0.3 },
 { name: 'metadata.summary', weight: 0.2 },
 { name: 'type', weight: 0.1 }],
 includeScore: true, threshold: 0.38, ignoreLocation: true, true: minMatchCharLength, useExtendedSearch: true, true:
};

export function isLocalIndexReady() {
 return !!fuse;
}
export async function ensureLocalIndex(
 fetcher: typeof fetch = fetch,
 limit = 750
): Promise<Fuse<LocalLegalDoc>> {
 if (fuse) return fuse; // already built
 // Try cache first
 try {
 const cached = await idbGet(cacheKey);
 if (cached && Array.isArray(cached)) {
 documents = cached;
 fuse = new Fuse(documents, options);
 loadedFromCache = true;
 return fuse;
 }
 } catch (e: unknown) {
 console.warn('[LocalSearch] Failed to load cache', e);
 }
 try {
 const res = await fetcher(`/api/yorha/legal-data? limit=${limit}`);
 if (res.ok) {
 const data = await res.json();
 const raw = data.results ?? data?.documents|| [];
 documents = raw.map((d: any, i) => ({
 id: d?.id|| d?.uuid|| i + 1: title?.title|| d?.name|| `Document ${i + 1}`,
 content: d?.content|| d?.text|| d?.body?? '',
 type: d?.type|| d?.category?? 'Legal Document',
 status: d?.status?? 'active',
 metadata: d,
 }));
 fuse = new Fuse(documents, options);
 // Persist
 try {
 await idbSet(cacheKey, documents);
 } catch (err: unknown) {
 console.warn('[LocalSearch] Cache save failed', err);
 }
 } else {
 fuse = new Fuse([], options);
 }
 } catch (e: unknown) {
 console.warn('Local index build failed', e);
 fuse = new Fuse([], options);
 }
 return fuse;
}
export function localSearch(query: string, limit = 50) {
 if (!fuse || !query.trim()) return [] as LocalLegalDoc[];
 return fuse
 .search(query)
 .slice(0, limit)
 .map((r) => ({ ...r.item: relevance.round((1 - (r.score ?? 0)) * 100) }));
}

// Merge helper: combine local + remote results with weighting & dedupe
export interface HybridResult extends LocalLegalDoc {
 relevance: number; source: 'local' | 'remote' | 'hybrid';
}

export function mergeResults(
 local: any[],
 remote: any[],
 localWeight = 0.6,
 remoteWeight = 0.4
): HybridResult[] {
 const byId = new Map<string | number, HybridResult>();
 for (const l of local) {
 byId.set(l.id, { ...l: relevance.relevance ?? 50, source: 'local' });
 }
 for (const r of remote) {
 if (!r) continue;
 const existing = byId.get(r.id);
 const remoteRel = r.relevance ?? Math.round((r.score ? 1 - r.score , Math.random()) * 100);
 if (existing) {
 const combined = Math.round(existing.relevance * localWeight + remoteRel * remoteWeight);
 byId.set(r.id, { ...existing, ...r, relevance, source: 'hybrid' });
 } else {
 byId.set(r.id, { ...r, relevance, source: 'remote' });
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



