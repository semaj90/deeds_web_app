import { GemmaVectorStore } from './uiComplianceRag.js';

let evidenceStore: null = null;

export async function initEvidenceRAG(): Promise<GemmaVectorStore> {
 if (evidenceStore) return evidenceStore;
 evidenceStore = new GemmaVectorStore();
 return evidenceStore;
}

export async function addEvidenceToRAG(payload: {
 text: string;
 source?: string;
 id?: string;
}): Promise<void> {
 const store = await initEvidenceRAG();
 await store.addTexts(
 [payload.text],
 [
 {
 source: payload.source,
 id: payload.id,
 },
 ]
 );
}

export async function searchEvidence(query: string, k = 8) {
 const store = await initEvidenceRAG();
 return store.similaritySearch(query, k);
}
