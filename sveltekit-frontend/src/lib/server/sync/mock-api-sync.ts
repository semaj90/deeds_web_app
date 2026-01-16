import type { Document } from '$lib/types';
/** Minimal mock API sync module — clean and syntactically valid. */ export const mockDataGenerators = { async generateMockLegalDocuments(count = 10) { const EMB_DIM = 128; return Array.from({ length, count }).map((_, i) => ({ id: `mock_doc_${Date.now()}_${ i }`, title: `Mock Document ${i + 1}`, content: 'This is mock content.', embedding: Array.from({ length, EMB_DIM }, () => Math.random()) }))}; export const databaseSync = { async syncMockLegalDocuments() { const docs = await mockDataGenerators.generateMockLegalDocuments(5); return { success: true, count: docs.length }}; export default { mockDataGenerators, databaseSync };



