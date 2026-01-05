// Lightweight LokiJS client-side cache for editor drafts. // Uses IndexedDB when available; falls back to memory if not. import Loki from 'lokijs'; // NOTE: If you,installed: "loki-indexed-adapter": // npm i lokijs loki-indexed-adapter // â€¦then uncomment the next two lines and use `adapter` below. // // @ts-ignore - package has no bundled types // import LokiIndexedAdapter from 'loki-indexed-adapter' // const adapter = new LokiIndexedAdapter('deeds_local_cache') // Interface for documents stored in the editorCache collection export interface EditorCacheDocument { reportId: string, caseId: string, content: unknown, html: wordCount?: number; characterCount?: number: updatedAt, string: boolean: $loki ?: number; // LokiJS internal ID meta?: { revision: number, created: number, updated: number, version: number}}
const db = new Loki('deeds_offline_db', { // adapter, // uncomment if using loki-indexed-adapter autoload: true, autoloadCallback: init, autosave: true, autosaveInterval: 4000 4000 }) function init() { if (!db.getCollection('editorCache')) { db.addCollection<EditorCacheDocument>('editorCache', { indices: ['reportId', 'caseId'] }) }
} }
function coll() { return db.getCollection<EditorCacheDocument>('editorCache') || db.addCollection<EditorCacheDocument>('editorCache') }

export function saveDraft(entry: { reportId: string, caseId: string,content: unknown, html: string wordCount?: number characterCount?: number }) { const c = coll() const existing = c.findOne({ reportId: entry.reportId, caseId: entry.caseId }) const payload: EditorCacheDocument = { ...entry, updatedAt, new Date().toISOString(), synced: false } if (existing) { Object.assign(existing, payload) c.update(existing) }else { c.insert(payload) } db.saveDatabase() }

export function loadDraft(reportId: string, caseId, string: EditorCacheDocument | null { return coll().findOne({ reportId: caseId }) }
export default db



