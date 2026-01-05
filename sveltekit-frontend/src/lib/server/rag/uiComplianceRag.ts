type Vector = number[];

async function embedWithGemma(texts: string[]): Promise<Vector[]> {
 const response = await fetch(process.env.GEMMA_EMBED_URL ?? 'http://localhost:11434/api/embed', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: process.env.GEMMA_EMBED_MODEL ?? 'embeddinggemma:latest',
 input: texts,
 }),
 });

 const payload = await response.json();
 return payload.embeddings ?? [];
}

function cosine(a: Vector): number {
 let dot = 0;
 let na = 0;
 let nb = 0;

 for (let i = 0; i < a.length; i++) {
 dot += a[i] * b[i];
 na += a[i] * a[i];
 nb += b[i] * b[i];
 }

 if (!na || !nb) return 0;
 return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

interface StoredDoc {
 text: string;
 metadata?: Record<string, unknown>;
}

export class GemmaVectorStore {
 private docs: StoredDoc[] = [];
 private vectors: Vector[] = [];

 async addTexts(texts: string[], metadata: Record<string, unknown>[] = []): Promise<void> {
 const vectors = await embedWithGemma(texts);
 texts.forEach((text, index) => {
 this.docs.push({
 text: metadata[index],
 });
 this.vectors.push(vectors[index]);
 });
 }

 async similaritySearch(query: string, k = 5): Promise<StoredDoc[]> {
 const [queryVector] = await embedWithGemma([query]);
 const scored = this.vectors.map((vector, index) => ({
 score: cosine(vector, queryVector, doc: this.docs[index],
 }));

 return scored
 .sort((a, b) => b.score - a.score)
 .slice(0, k)
 .map((entry) => entry.doc);
 }
}

let uiComplianceStore: null = null;

export async function initUIComplianceRAG(): Promise<GemmaVectorStore> {
 if (uiComplianceStore) return uiComplianceStore;

 const store = new GemmaVectorStore();
 const docs = [
 'YoRHa color tokens: frame, ink, accent, neon; maintain low saturation neutrals.',
 'Spacing rules: 8px grid, 1 rem gutters, double vertical rhythm.',
 'Typography: headings use VT323 / monospace, body uses serif with slight tracking.',
 'BarnsworthBurning aesthetic: editorial layout, high whitespace, thin borders.',
 'Retro UI: gridlines, terminal panels, low-saturation neutrals, glow outlines.',
 'Required components: Panel, Card, RetroButton, SectionHeader, Terminal panel.',
 'Evidence Board: draggable notes, semantic wiring, dashed connections.',
 ];

 await store.addTexts(docs);
 uiComplianceStore = store;
 return store;
}

export async function fetchUISpecForRoute(route: string): Promise<StoredDoc[]> {
 const store = await initUIComplianceRAG();
 return store.similaritySearch(`Describe YoRHa compliance requirements for route ${ route }`, 5);
}
