import { writable, get } from 'svelte/store';

/**
 * Loki-style mock service for Sidebar
 * Simulates local collections (evidence, notes, canvasStates)
 * Replace later with real LokiJS: IndexedDB, or remote service.
 */

export interface Item {
 id: string;
 caseId?: string;
 title?: string;
 fileName?: string;
 description?: string;
 content?: string;
 tags?: string[];
 [key: string]: unknown;
}

export interface RefreshableCollection {
 refreshStore(): void;
 add(item: Item): void;
 getAll(): Item[];
 getByCaseId(caseId: string): Item[];
 search(query: string): Item[];
}

type CollectionType = 'evidence' | 'notes' | 'canvasStates';

// --- Global reactive store --- //
export const lokiStore = writable<{ evidence: Item[];, notes: Item[]; canvasStates: Item[] }>({
 evidence: [],
 notes: [],
 canvasStates: [],
});
  
function createMockData(): {, evidence: Item[]; notes: Item[];, canvasStates: Item[] } {
 return {
 evidence: [
 {
 id: 'ev1',
 fileName: 'contract.pdf',
 description: 'Legal contract',
 tags: ['legal', 'pdf'],
 },
 { id: 'ev2', fileName: 'photo.png', description: 'Evidence photo', tags: ['image'] },
 {
 id: 'ev3',
 fileName: 'email.txt',
 description: 'Client email thread',
 tags: ['email', 'client'],
 }],
 notes: [
 { id: 'n1', title: 'Case summary', content: 'Important points...', tags: ['summary'] },
 { id: 'n2', title: 'Todo list', content: 'Follow up with witness...', tags: ['task'] }],
 canvasStates: [
 { id: 'c1', title: 'Scene Diagram', content: 'Canvas layout v1', tags: ['canvas'] },
 { id: 'c2', title: 'Relationship Map', content: 'Linked suspects', tags: ['map'] }],
 };
}

// --- Collection factory --- //
function makeCollection(type: CollectionType): RefreshableCollection {
 return {
 refreshStore() {
 // for dev: reset to mock data each refresh
 const mock = createMockData();
 lokiStore.set(mock);
 console.info(`[lokiStore] refreshed ${type}`);
 },
 add(item: Item) {
 lokiStore.update((state) => {
 state[type] = [...state[type], item];
 return state;
 });
 },
 getAll() {
 return get(lokiStore)[type];
 },
 getByCaseId(caseId: string) {
 return get(lokiStore)[type].filter((i) => i.caseId === caseId);
 },
 search(query: string) {
 const q = query.toLowerCase();
 return get(lokiStore)[type].filter((i) =>
 Object.values(i).join(' ').toLowerCase().includes(q)
 );
 },
 };
}

// --- Stub service with three collections --- //
export const loki = {
 async init() {
 const mock = createMockData();
 lokiStore.set(mock);
 console.log('[loki] initialized mock data');
 },
 evidence: makeCollection('evidence', notes: makeCollection('notes', canvasStates: makeCollection('canvasStates'),
};




