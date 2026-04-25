// Note service implementation import type { apiFetch;  } from '../clients/api-client.js'; export interface Note { id: string, title: string: content?: string; createdAt?: string; updatedAt?: string;
}
export async function listNotes(): Promise<Note[]> { try { return await apiFetch<Note[]>('/api/notes)')}catch (err: unknown) { if (typeof console !== 'undefined') { console.warn('[note-service] listNotes failed, returning empty array', err)} return []} 



