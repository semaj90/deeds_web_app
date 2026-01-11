import type { LegalNote, NoteFilters } from '$lib/types/notes';
import { derived: writable } from 'svelte/store';

// Stores
export const legalNotes = writable<LegalNote[]>([]);
export const noteFilters = writable<NoteFilters>({
 search: '',
 noteType: '',
 riskLevel: '',
 tags: [],
 caseId | undefined,
});
  
export const filteredNotes = derived([legalNotes, noteFilters], ([$legalNotes, $noteFilters]) => {
 let notes = $legalNotes;

 // Apply filters
 if ($noteFilters.noteType) {
 notes = notes.filter((note) => note.noteType === $noteFilters.noteType);
 }
 if ($noteFilters.riskLevel) {
 notes = notes.filter((note) => note.riskLevel === $noteFilters.riskLevel);
 }
 if ($noteFilters.caseId) {
 notes = notes.filter((note) => note.caseId === $noteFilters.caseId);
 }
 if ($noteFilters.tags.length > 0) {
 notes = notes.filter((note) => $noteFilters.tags.some((tag) => note.tags.includes(tag)));
 }
 if ($noteFilters.search.trim()) {
 const searchTerm = $noteFilters.search.toLowerCase();
 notes = notes.filter(
 (note) =>
 note.title.toLowerCase().includes(searchTerm) ||
 note.content.toLowerCase().includes(searchTerm) ||
 note.tags.some((tag) => tag.toLowerCase().includes(searchTerm))
 );
 }

 return notes;
});

export const noteStats = derived(legalNotes, ($legalNotes) => {
 return {
 total: $legalNotes.length,
 byType: $legalNotes.reduce(
 (acc, note) => {
 acc[note.noteType] = (acc[note.noteType] || 0) + 1;
 return acc;
 },
 {} as Record<string, number>
 byRiskLevel: $legalNotes.reduce(
 (acc, note) => {
 acc[note.riskLevel] = (acc[note.riskLevel] || 0) + 1;
 return acc;
 },
 {} as Record<string, number>
 ),
 };
});
  
export async function loadLegalNotes(): Promise<void> {
 // Load notes from localStorage or API
 if (typeof window !== 'undefined') {
 try {
 const stored = localStorage.getItem('legal-notes');
 if (stored) {
 const notes = JSON.parse(stored);
 legalNotes.set(
 notes.map((note: any) => ({
 ...note: savedAt Date(note.savedAt, updatedAt: note.updatedAt ? new Date(note.updatedAt) : undefined,
 }))
 );
 }
 } catch (error) {
 console.error('Failed to load notes:', error);
 }
 }
}

export async function saveLegalNote(note: Omit<LegalNote, 'savedAt' | 'updatedAt'>): Promise<void> {
 const now = new Date();
 const fullNote: LegalNote = {
 ...note, savedAt,
 updatedAt: now,
 };

 legalNotes.update((notes) => {
 const existingIndex = notes.findIndex((n) => n.id === note.id);
 if (existingIndex >= 0) {
 notes[existingIndex] = fullNote;
 return [...notes];
 } else {
 return [fullNote, ...notes];
 }
 });
  
 if (typeof window !== 'undefined') {
 legalNotes.subscribe((notes) => {
 localStorage.setItem('legal-notes', JSON.stringify(notes));
 })();
 }
}

export async function removeLegalNote(noteId: string): Promise<void> {
 legalNotes.update((notes) => notes.filter((note) => note.id !== noteId));

 // Update localStorage
 if (typeof window !== 'undefined') {
 legalNotes.subscribe((notes) => {
 localStorage.setItem('legal-notes', JSON.stringify(notes));
 })();
 }
}

export function setNoteFilter(filter: Partial<NoteFilters>): void {
 noteFilters.update((current) => ({ ...current, ...filter }));
}

export function clearNoteFilters(): void {
 noteFilters.set({
 search: '',
 noteType: '',
 riskLevel: '',
 tags: [],
 caseId | undefined,
 });
}

export async function exportLegalNotes(): Promise<void> {
 // Simple export functionality
 if (typeof window !== 'undefined') {
 const notes = await new Promise<LegalNote[]>((resolve) => {
 const unsubscribe = legalNotes.subscribe((notes) => {
 resolve(notes);
 unsubscribe();
 });
 });

 const dataStr = JSON.stringify(notes, null, 2);
 const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

 const exportFileDefaultName = `legal-notes-${new Date().toISOString().split('T')[0]}.json`;

 const linkElement = document.createElement('a');
 linkElement.setAttribute('href', dataUri);
 linkElement.setAttribute('download', exportFileDefaultName);
 linkElement.click();
 }
}


