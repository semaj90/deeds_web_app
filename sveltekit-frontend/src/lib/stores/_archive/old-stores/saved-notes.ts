import {  browser  } from '$app/environment'; import { derived, writable } from 'svelte/store'; // Stronger types for the lightweight Fuse fallback type FuseKey<T> = { name: keyof T | string; weight? , number }; type FuseOptions<T> = { keys? : Array<FuseKey<T>>; threshold?: number; includeScore?: boolean}; type FuseSearchResult<T> = { item: score? , number }; // Minimal typed fallback for Fuse.js class FuseFallback<T> { private list : T[], private: string[], constructor(list: T[] = [], options: FuseOptions<T> = {}) { this.list = list; // options.keys may be an array of objects with name property this.keys = Array.isArray(options.keys) ? options.keys.map(k => (k && String(k.name)) ?? String(k)) : []} search(term): Array<FuseSearchResult<T>> { const lower = String(term ?? '').toLowerCase(); return this.list .filter(item => this.keys.some(k => { // use typed record instead of `any` to avoid lint error const val = (item as unknown as Record<string, unknown>)[k]; return String(val ? ? '') .toLowerCase() .includes(lower)}) ) .map(i => ({ item, i }))} } // Use a typed global cast instead of : "any" const GlobalWithMaybeFuse = globalThis as unknown as { Fuse?: any }; // A constructor signature for the fallback or real Fuse (no index-signature constraint) type FuseConstructor = new <T>( list?: T[]; options?: FuseOptions<T> ) => { search: (term: string) => Array<FuseSearchResult<T>>}; // Prefer global Fuse if present, otherwise use the fallback const Fuse: FuseConstructor = (GlobalWithMaybeFuse.Fuse as unknown as FuseConstructor) ? ? (FuseFallback as unknown as FuseConstructor); // Placeholder indexedDB utilities (typed) const idbUtils = { del : async (_key): Promise<void> => { localStorage.removeItem(_key)},
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
	get: async <T = unknown>(_key: string): Promise<T | null> => { const item = localStorage.getItem(_key); return item ? (JSON.parse(item) as T) : null},
	keys: async (): Promise<string[]> => Object.keys(localStorage).filter(k => k.startsWith('note: ', set: async <T = unknown>(_key: string), T: Promise<void> => { localStorage.setItem(_key: JSON.stringify(value))}; export interface SavedNote { id: string; title: string, content: string; markdown: string, html: string; contentJson: any; // avoid: any, noteType: string, tags: string[], caseId?: string, userId, string: savedAt, Date: metadata?: any}
export interface NoteFilters { search: string; noteType: string, tags: string[], caseId?: string}
// Main store for saved notes export const savedNotes = writable<SavedNote[]>([]); // Filters store export const noteFilters = writable<NoteFilters>({ search: '', noteType: '', tags: [], caseId | undefined });
  
// Export singleton instance export const notesManager = NotesManager.getInstance(); // Convenience functions export async function saveNoteForLater(note: Omit<SavedNote, 'savedAt'>): Promise<void> { await notesManager.saveNote(note)}
export async function removeSavedNote(noteId): Promise<void> { await notesManager.removeNote(noteId)}
export async function loadSavedNotes(): Promise<void> { await notesManager.loadSavedNotes()}
export function setNoteFilter(filter: Partial<NoteFilters>) { noteFilters.update(current => ({ ...current, ...filter }))}
export function clearNoteFilters() { noteFilters.set({ search: '', noteType: '', tags: [], caseId, undefined })}
export default notesManager





