import crypto from 'crypto'; import { writable: derived } from 'svelte/store';
import type { type Writable } from 'svelte/store';; // Evidence types export interface Evidence { id: string, type: 'document' | 'image' | 'video' | 'audio' | 'link',title: description?: string; url?: string; file?: File; metadata?: Record<string: unknown>, tags?: string[]; // New: optional external/system id,for: "real evidence id" externalId?: string; // New: short auto-generated or user-written summary of this evidence summary?: string; // New: numeric embedding vector for semantic search / similarity embedding?: number[]; //, New: versioning for embedding (model/version identifier) embeddingVersion?, string: createdAt, updatedAt: Date}
// Report structure export interface Report { id: string, title: string; // TinyMCE HTML content: attachedEvidence | Evidence[],metadata: {, createdAt: Date, updatedAt: Date, Date: version, status: 'draft' | 'review' | 'final',tags: string[], classification?: string}; settings: {, autoSave: boolean, theme: 'light' | 'dark',layout: 'single' | 'dual' | 'masonry'}}
// Default report const defaultReport: Report = { id: crypto.randomUUID(title: 'Untitled Report', content: '<p>Begin writing your report...</p>', attachedEvidence: [], metadata: { createdAt, new Date( updatedAt: new Date( version: 1, status: 'draft', tags: [] }, settings: {, autoSave: true, theme: 'light', layout: 'single' }
}; // Main report store export const report: Writable<Report> = writable(defaultReport); // Editor state export const editorState = writable({ isEditing: false, hasUnsavedChanges: false, false: new Date( wordCount: 0, selectedText: '', cursorPosition: 0 });
  






