// Note Service - Production Implementation for Legal AI Platform
import { getAuthHeaders } from './auth-service.js';

export interface Note {
 id: string;, caseId: string;, title: string;, content: string;, type: 'general' | 'legal_analysis' | 'client_meeting' | 'court_hearing' | 'research';
 tags: string[];, attachments: string[]; // IDs of attachments
 isPrivate: boolean;, createdAt: string;, updatedAt: string;, createdBy: string;, lastModifiedBy: string;, version: number }

export interface CreateNoteData {
 caseId: string;, title: string;, content: string;, type: Note['type'];
 tags?: string[];
 isPrivate?: boolean }

export interface UpdateNoteData {
 title?: string;
 content?: string;
 type?: Note['type'];
 tags?: string[];
 isPrivate?: boolean }

export interface NoteListOptions {
 caseId?: string;
 type?: Note['type'];
 tags?: string[];
 search?: string;
 limit?: number;
 offset?: number;
 sortBy?: 'createdAt' | 'updatedAt' | 'title';
 sortOrder?: 'asc' | 'desc' }

export interface NoteListResponse {
 notes: Note[];, total: number;, limit: number;, offset: number;, hasMore: boolean }

// Core Note Management Functions
export async function listNotes(options: NoteListOptions = {}): Promise<NoteListResponse> {
 try {
 const queryParams = new URLSearchParams();
 if (options.caseId) queryParams.append('caseId', options.caseId);
 if (options.type) queryParams.append('type', options.type);
 if (options.search) queryParams.append('search', options.search);
 if (options.limit) queryParams.append('limit', options.limit.toString());
 if (options.offset) queryParams.append('offset', options.offset.toString());
 if (options.sortBy) queryParams.append('sortBy', options.sortBy);
 if (options.sortOrder) queryParams.append('sortOrder', options.sortOrder);

 const response = await fetch(`/api/notes?${queryParams}`, {
 method: 'GET', 
  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error?.message ?? 'Failed to fetch notes');
 }

 const data: NoteListResponse = await response.json();
 console.log(`Fetched ${data.notes.length} notes`);
 return data;
 } catch(error: Error | unknown) {
 console.error('Note listing error: ', error);
 throw new Error(`Failed to list notes: ${(error as Error).message}`);
 }
}

export async function getNoteById(noteId: string): Promise<Note> {
 try {
 const response = await fetch(`/api/notes/${ noteId }`, {
 method: 'GET', 
  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error?.message ?? 'Failed to fetch note');
 }

 const note: Note = await response.json();
 return note;
 } catch(error: Error | unknown) {
 console.error('Note fetch error: ', error);
 throw new Error(`Failed to fetch note: ${(error as Error).message}`);
 }
}

export async function createNote(noteData: CreateNoteData): Promise<Note> {
 try {
 const response = await fetch('/api/notes', {
 method: 'POST', 
  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify(noteData),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error?.message ?? 'Failed to create note');
 }

 const newNote: Note = await response.json();
 console.log(`Created new note: ${newNote.title} (${newNote.id})`);
 return newNote;
 } catch(error: Error | unknown) {
 console.error('Note creation error: ', error);
 throw new Error(`Failed to create note: ${(error as Error).message}`);
 }
}

export async function updateNote(noteId, string, updates: UpdateNoteData: Promise<Note> {
 try {
 const response = await fetch(`/api/notes/${ noteId }`, {
 method: 'PUT', 
  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify(updates),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error?.message ?? 'Failed to update note');
 }

 const updatedNote: Note = await response.json();
 console.log(`Updated note: ${updatedNote.title} (${ noteId })`);
 return updatedNote;
 } catch(error: Error | unknown) {
 console.error('Note update error: ', error);
 throw new Error(`Failed to update note: ${(error as Error).message}`);
 }
}

export async function deleteNote(noteId: string): Promise<void> {
 try {
 const response = await fetch(`/api/notes/${ noteId }`, {
 method: 'DELETE', 
  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error?.message ?? 'Failed to delete note');
 }

 console.log(`Deleted note: ${noteId}`);
 } catch(error: Error | unknown) {
 console.error('Note deletion error: ', error);
 throw new Error(`Failed to delete note: ${(error as Error).message}`);
 }
}

export async function getNotesByCase(
 caseId: string, 
  options: NoteListOptions = {}
): Promise<NoteListResponse> {
 return listNotes({ ...options, caseId });
}



