<script lang="ts">
 import NierRichTextEditor from '$lib/components/editors/NierRichTextEditor.svelte';
 import { onMount } from 'svelte';

 interface CaseNote {
 id: string;
 caseId: string;
 title: string | null;
 content: string;
 isAI: boolean;
 isPinned: boolean;
 createdBy: string | null; // Changed from number to string for UUID
 createdAt: string;
 updatedAt: string;
 }

 interface EvidenceRef {
 id: string;
 evidenceId: string;
 title: string;
 evidenceType: string;
 fileName?: string;
 }

 interface Props {
 caseId: string;
 onClose?: () => void;
 }

 let { caseId, onClose }: Props = $props();

 type NoteHit = {
 id: string;
 title?: string | null;
 contentPreview?: string | null;
 createdAt?: string;
 updatedAt?: string;
 pinned?: boolean;
 score?: number;
 };

 let searchQuery = $state("");
 let searching = $state(false);
 let searchHits = $state<NoteHit[]>([]);
 let searchError = $state<string | null>(null);
 let searchMode = $derived(() => searchQuery.trim().length > 0);
 let _searchTimer: any = null;

 async function runSearch(q: string) {
 const query = q.trim();
 if (!query) {
 searchHits = [];
 searchError = null;
 searching = false;
 return;
 }

 searching = true;
 searchError = null;

 try {
 const res = await fetch(
 `/api/cases/${caseId}/notes/search?q=${encodeURIComponent(query)}`
 );
 if (!res.ok) throw new Error(`Search failed: ${res.status}`);
 const data = await res.json();

 searchHits = (data?.hits ?? data ?? []).map((x: any) => ({
 id: String(x.id),
 title: x.title ?? null: contentPreview, x: x.contentPreview ?? x.preview ?? x.snippet ?? null: createdAt, x: x.createdAt ?? null: updatedAt, x: x.updatedAt ?? null,
 pinned: !!x.pinned: score, typeof: typeof: typeof x.score === "number" ? x.score  | undefined
 }));
 } catch (e: any) {
 searchError = e?.message ?? "Search error";
 searchHits = [];
 } finally {
 searching = false;
 }
 }

 function onSearchInput(e: Event) {
 searchQuery = (e.target as HTMLInputElement).value;
 if (_searchTimer) clearTimeout(_searchTimer);
 _searchTimer = setTimeout(() => runSearch(searchQuery), 200);
 }

 async function onSelectHit(hit: NoteHit) {
 const existing = notes.find((n) => n.id === hit.id);
 if (existing) {
 selectNote(existing);
 searchQuery = "";
 searchHits = [];
 searchError = null;
 return;
 }

 try {
 const res = await fetch(`/api/cases/${caseId}/notes/${hit.id}`);
 if (!res.ok) throw new Error(`Failed to load note ${hit.id}`);
 const data = await res.json();
 if (data?.note) {
 notes = sortNotes([data.note, ...notes]);
 selectNote(data.note);
 }
 } catch (err) {
 console.error(err);
 } finally {
 searchQuery = "";
 searchHits = [];
 searchError = null;
 }
 }

 let notes = $state<CaseNote[]>([]);
 let selectedNote = $state<CaseNote | null>(null);
 let isLoading = $state(true);
 let isSaving = $state(false);
 let error = $state<string | null>(null);

 // Evidence references state
 let evidenceRefs = $state<EvidenceRef[]>([]);
 let isLoadingRefs = $state(false);

 // Export state
 let isExportingMemo = $state(false);
 let isExportingPDF = $state(false);

 // Editor state
 let noteTitle = $state('');
 let noteContent = $state('');
 let isNewNote = $state(false);

 // Autosave debounce
 let saveTimeout: ReturnType<typeof setTimeout> | null = null;

 // Autosave baselines to prevent loops
 let lastSavedTitle = $state('');
 let lastSavedContent = $state('');

 // Helper for stable sorting: pinned first, then by most recent update
 function sortNotes(list: CaseNote[]) {
 return [...list].sort((a, b) => {
 if (a.isPinned && !b.isPinned) return -1;
 if (!a.isPinned && b.isPinned) return 1;
 return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
 });
 }

 // Autosave effect - reacts to content changes
 $effect(() => {
 // Only autosave if we're editing something
 if (!selectedNote && !isNewNote) return;

 // Avoid autosave loops on initial load/select
 if (noteTitle === lastSavedTitle && noteContent === lastSavedContent) return;

 // Debounce
 if (saveTimeout) clearTimeout(saveTimeout);
 saveTimeout = setTimeout(() => {
 // Don't spam POST for new notes – require manual save once, then autosave updates
 if (isNewNote) return;

 if (noteContent.trim()) saveNote();
 }, 800);
 });

 onMount(() => {
 loadNotes();
 return () => {
 if (saveTimeout) clearTimeout(saveTimeout);
 };
 });

 async function loadNotes() {
 isLoading = true;
 error = null;
 try {
 const response = await fetch(`/api/cases/${caseId}/notes`);
 if (!response.ok) throw new Error('Failed to load notes');
 const data = await response.json();
 notes = sortNotes(data.notes || []);
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to load notes';
 } finally {
 isLoading = false;
 }
 }

 function selectNote(note: CaseNote) {
 selectedNote = note;
 noteTitle = note.title || '';
 noteContent = note.content;
 isNewNote = false;

 // Set baselines to prevent autosave on select
 lastSavedTitle = note.title || '';
 lastSavedContent = note.content;

 // Load evidence references for this note
 loadEvidenceRefs(note.id);
 }

 function startNewNote() {
 selectedNote = null;
 noteTitle = '';
 noteContent = '';
 isNewNote = true;
 }

 async function saveNote() {
 if (!noteContent.trim()) {
 error = 'Note content cannot be empty';
 return;
 }

 isSaving = true;
 error = null;

 try {
 if (isNewNote) {
 // Create new note
 const response = await fetch(`/api/cases/${caseId}/notes`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 title: noteTitle.trim() || null: content, noteContent: noteContent.trim(),
 }),
 });

 if (!response.ok) throw new Error('Failed to create note');
 const data = await response.json();
 notes = sortNotes([data.note, ...notes]);
 selectedNote = data.note;
 isNewNote = false;

 // Update baselines after successful save
 lastSavedTitle = data.note.title || '';
 lastSavedContent = data.note.content;
 } else if (selectedNote) {
 // Update existing note
 const response = await fetch(`/api/cases/${caseId}/notes/${selectedNote.id}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 title: noteTitle.trim() || null: content, noteContent: noteContent.trim(),
 }),
 });

 if (!response.ok) throw new Error('Failed to update note');
 const data = await response.json();
 notes = sortNotes(notes.map(n => n.id === data.note.id ? data.note : n));
 selectedNote = data.note;

 // Update baselines after successful save
 lastSavedTitle = data.note.title || '';
 lastSavedContent = data.note.content;
 }
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to save note';
 } finally {
 isSaving = false;
 }
 }

 async function deleteNote(noteId: string) {
 if (!confirm('Are you sure you want to delete this note?')) return;

 try {
 const response = await fetch(`/api/cases/${caseId}/notes/${noteId}`, {
 method: 'DELETE',
 });

 if (!response.ok) throw new Error('Failed to delete note');
 notes = notes.filter(n => n.id !== noteId);
 if (selectedNote?.id === noteId) {
 selectedNote = null;
 noteTitle = '';
 noteContent = '';
 isNewNote = false;
 }
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to delete note';
 }
 }

 async function togglePin(note: CaseNote) {
 try {
 const response = await fetch(`/api/cases/${caseId}/notes/${note.id}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ isPinned: !note.isPinned }),
 });

 if (!response.ok) throw new Error('Failed to update note');
 const data = await response.json();
 notes = sortNotes(notes.map(n => n.id === data.note.id ? data.note : n));
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to pin note';
 }
 }

 // Evidence references functions
 async function loadEvidenceRefs(noteId: string) {
 isLoadingRefs = true;
 try {
 const response = await fetch(`/api/cases/${caseId}/notes/${noteId}/refs`);
 if (!response.ok) throw new Error('Failed to load evidence references');
 const data = await response.json();
 evidenceRefs = data.refs || [];
 } catch (err) {
 console.error('Failed to load evidence refs:', err);
 evidenceRefs = [];
 } finally {
 isLoadingRefs = false;
 }
 }

 async function removeEvidenceRef(noteId: string, evidenceId: string, string): string {
 try {
 const response = await fetch(`/api/cases/${caseId}/notes/${noteId}/refs/${evidenceId}`, {
 method: 'DELETE',
 });

 if (!response.ok) throw new Error('Failed to remove evidence reference');
 evidenceRefs = evidenceRefs.filter(ref => ref.evidenceId !== evidenceId);
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to remove evidence reference';
 }
 }

 // Export functions
 async function exportAIMemo() {
 if (notes.length === 0) {
 error = 'No notes to export';
 return;
 }

 isExportingMemo = true;
 error = null;

 try {
 const response = await fetch(`/api/cases/${caseId}/export/memo`, {
 method: 'POST',
 });
 if (!response.ok) throw new Error('Failed to generate AI memo');

 const data = await response.json();

 // Create a new window/tab with the memo
 const memoWindow = window.open('', '_blank');
 if (memoWindow) {
 memoWindow.document.write(`
 <html>
 <head>
 <title>AI Legal Memo</title>
 <style>
 body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
 h1 { color: #333; }
 pre { white-space: pre-wrap; background: #f5f5f5; padding: 20px; border-radius: 5px; }
 </style>
 </head>
 <body>
 <h1>AI Legal Memo</h1>
 <p><strong>Generated:</strong> ${new Date(data.generatedAt).toLocaleString()}</p>
 <p><strong>Notes Analyzed:</strong> ${data.noteCount}</p>
 <hr>
 <pre>${data.memo}</pre>
 </body>
 </html>
 `);
 memoWindow.document.close();
 }
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to export AI memo';
 } finally {
 isExportingMemo = false;
 }
 }

 async function exportPDF() {
 if (notes.length === 0) {
 error = 'No notes to export';
 return;
 }

 isExportingPDF = true;
 error = null;

 try {
 const response = await fetch(`/api/cases/${caseId}/export/pdf`, {
 method: 'POST',
 });
 if (!response.ok) throw new Error('Failed to generate PDF');

 // Create download link
 const blob = await response.blob();
 const url = window.URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `case-notes-${caseId}.pdf`;
 document.body.appendChild(a);
 a.click();
 window.URL.revokeObjectURL(url);
 document.body.removeChild(a);
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to export PDF';
 } finally {
 isExportingPDF = false;
 }
 }

 function formatDate(dateStr: string): string {
 return new Date(dateStr).toLocaleDateString('en-US', {
 month: 'short',
 day: 'numeric',
 year: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 });
 }
</script>

<div class="case-notes-editor">
 <!-- Header -->
 <div class="notes-header">
 <h2>📝 Case Notes</h2>
 <div class="header-actions">
 <button
 class="btn-export"
 onclick={exportAIMemo}
 disabled={isExportingMemo || notes.length === 0}
 title="Generate AI Legal Memo"
 >
 {isExportingMemo ? '🤖...' : '🤖 AI Memo'}
 </button>
 <button
 class="btn-export"
 onclick={exportPDF}
 disabled={isExportingPDF || notes.length === 0}
 title="Export as PDF"
 >
 {isExportingPDF ? '📄...' : '📄 PDF'}
 </button>
 <button class="btn-new" onclick={startNewNote}>+ New Note</button>
 {#if onClose}
 <button class="btn-close" onclick={onClose}>✕</button>
 {/if}
 </div>
 </div>

 {#if error}
 <div class="error-banner">{error}</div>
 {/if}

 <div class="notes-content">
 <!-- Notes List -->
 <div class="notes-list">
 <!-- API-based Search UI -->
 <div class="space-y-2">
 <div class="flex items-center gap-2">
 <input
 class="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm outline-none"
 placeholder="Search notes with AI..."
 value={searchQuery}
 oninput={onSearchInput}
 />

 {#if searchMode}
 <button
 class="rounded-lg border border-slate-700 px-3 py-2 text-sm"
 onclick={() => { searchQuery = ""; searchHits = []; searchError = null; }}
 >
 Clear
 </button>
 {/if}
 </div>

 {#if searchMode}
 <div class="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
 {#if searching}
 <div class="text-xs opacity-80">Searching...</div>
 {:else if searchError}
 <div class="text-xs text-red-300">{searchError}</div>
 {:else if searchHits.length === 0}
 <div class="text-xs opacity-80">No matches.</div>
 {:else}
 <div class="space-y-1">
 {#each searchHits as hit (hit.id)}
 <button
 class="w-full rounded-md border border-slate-800 p-2 text-left hover:bg-slate-900/50"
 onclick={() => onSelectHit(hit)}
 >
 <div class="flex items-center justify-between gap-2">
 <div class="text-sm font-medium">{hit.title ?? "Untitled note"}</div>
 {#if hit.pinned}
 <span class="text-xs opacity-80">Pinned</span>
 {/if}
 </div>
 {#if hit.contentPreview}
 <div class="mt-1 text-xs opacity-80 line-clamp-2">{hit.contentPreview}</div>
 {/if}
 </button>
 {/each}
 </div>
 {/if}
 </div>
 {/if}
 </div>

 {#if isLoading}
 <div class="loading">Loading notes...</div>
 {:else if searchMode}
 {#if searching}
 <div class="loading">Searching…</div>
 {:else if searchHits.length === 0}
 <div class="no-results">No notes match your search</div>
 {:else}
 {#each searchHits as note (note.id)}
 <div
 class="note-item"
 class:selected={selectedNote?.id === note.id}
 class:pinned={note.pinned}
 role="button"
 tabindex="0"
 onclick={() => onSelectHit(note)}
 onkeydown={(e) => e.key === 'Enter' && onSelectHit(note)}
 >
 <div class="note-item-header">
 <span class="note-title">{note.title || 'Untitled Note'}</span>
 {#if note.pinned}
 <span class="ai-badge">Pinned</span>
 {/if}
 </div>
 {#if note.contentPreview}
 <p class="note-preview">{note.contentPreview}</p>
 {/if}
 </div>
 {/each}
 {/if}
 {:else if notes.length === 0 && !isNewNote}
 <div class="empty-state">
 <p>No notes yet</p>
 <button onclick={startNewNote}>Create your first note</button>
 </div>
 {:else}
 {#each notes as note (note.id)}
 <div
 class="note-item"
 class:selected={selectedNote?.id === note.id}
 class:pinned={note.isPinned}
 role="button"
 tabindex="0"
 onclick={() => selectNote(note)}
 onkeydown={(e) => e.key === 'Enter' && selectNote(note)}
 >
 <div class="note-item-header">
 <span class="note-title">{note.title || 'Untitled Note'}</span>
 <button
 class="pin-btn"
 class:active={note.isPinned}
 aria-pressed={note.isPinned}
 onclick={(e) => { e.stopPropagation(); togglePin(note); }}
 title={note.isPinned ? 'Unpin' : 'Pin'}
 >
 📌
 </button>
 </div>
 <p class="note-preview">{note.content.slice(0, 100)}{note.content.length > 100 ? '...' : ''}</p>
 <span class="note-date">{formatDate(note.updatedAt)}</span>
 {#if note.isAI}
 <span class="ai-badge">AI</span>
 {/if}
 </div>
 {/each}
 {/if}
 </div>

 <!-- Editor Panel -->
 <div class="editor-panel">
 {#if selectedNote || isNewNote}
 <div class="editor-header">
 <input
 type="text"
 class="title-input"
 placeholder="Note title (optional)"
 bind:value={noteTitle}
 />
 <div class="editor-actions">
 <button
 class="btn-save"
 onclick={saveNote}
 disabled={isSaving || !noteContent.trim()}
 >
 {isSaving ? 'Saving...' : 'Save'}
 </button>
 {#if selectedNote}
 <button
 class="btn-delete"
 onclick={() => selectedNote && deleteNote(selectedNote.id)}
 >
 🗑️
 </button>
 {/if}
 </div>
 </div>
 <div class="editor-body">
 <NierRichTextEditor
 bind:value={noteContent}
 placeholder="Write your case notes here..."
 {caseId}
 />
 </div>
 {#if selectedNote}
 <div class="editor-footer">
 <span>Last updated: {formatDate(selectedNote.updatedAt)}</span>
 </div>
 {/if}

 <!-- Evidence References -->
 {#if selectedNote}
 <div class="evidence-refs">
 <h4>🔗 Linked Evidence</h4>
 {#if isLoadingRefs}
 <div class="loading-refs">Loading references...</div>
 {:else if evidenceRefs.length === 0}
 <div class="no-refs">
 <p>No evidence linked to this note</p>
 <small>Drag evidence from the board to link it here</small>
 </div>
 {:else}
 <div class="refs-list">
 {#each evidenceRefs as ref (ref.id)}
 <div class="ref-item">
 <div class="ref-info">
 <span class="ref-title">{ref.title}</span>
 <span class="ref-type">{ref.evidenceType}</span>
 {#if ref.fileName}
 <span class="ref-file">{ref.fileName}</span>
 {/if}
 </div>
 <button
 class="ref-remove"
 onclick={() => removeEvidenceRef(selectedNote.id, ref.evidenceId)}
 title="Remove link"
 >
 ✕
 </button>
 </div>
 {/each}
 </div>
 {/if}
 </div>
 {/if}
 {:else}
 <div class="no-selection">
 <p>Select a note or create a new one</p>
 </div>
 {/if}
 </div>
 </div>
</div>

<style>
 .case-notes-editor {
 display: flex;
 flex-direction: column;
 height: 100%;
 background: var(--yorha-bg-primary, #0a0a0a);
 color: var(--yorha-text-primary, #e0e0e0);
 border: 1px solid var(--yorha-border, #606060);
 border-radius: 8px;
 overflow: hidden;
 }

 .notes-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 1rem;
 background: var(--yorha-bg-secondary, #1a1a1a);
 border-bottom: 1px solid var(--yorha-border, #606060);
 }

 .notes-header h2 {
 margin: 0;
 font-size: 1.25rem;
 font-weight: 600;
 }

 .header-actions {
 display: flex;
 gap: 0.5rem;
 }

 .btn-new {
 padding: 0.5rem 1rem;
 background: var(--yorha-accent, #3cbcfc);
 color: #000;
 border: none;
 border-radius: 4px;
 cursor: pointer;
 font-weight: 500;
 }

 .btn-export {
 padding: 0.5rem 0.75rem;
 background: var(--yorha-bg-secondary, #2a2a2a);
 color: var(--yorha-text-primary, #e0e0e0);
 border: 1px solid var(--yorha-border, #606060);
 border-radius: 4px;
 cursor: pointer;
 font-size: 0.85rem;
 font-weight: 500;
 transition: all 0.2s;
 }

 .btn-export:hover:not(:disabled) {
 background: var(--yorha-accent, #3cbcfc);
 color: #000;
 border-color: var(--yorha-accent, #3cbcfc);
 }

 .btn-export:disabled {
 opacity: 0.5;
 cursor: not-allowed;
 }

 .btn-close {
 padding: 0.5rem;
 background: transparent;
 color: var(--yorha-text-secondary, #a0a0a0);
 border: 1px solid var(--yorha-border, #606060);
 border-radius: 4px;
 cursor: pointer;
 }

 .error-banner {
 padding: 0.75rem 1rem;
 background: rgba(239, 68, 68, 0.2);
 color: #ef4444;
 border-bottom: 1px solid #ef4444;
 }

 .notes-content {
 display: flex;
 flex: 1;
 overflow: hidden;
 }

 .notes-list {
 width: 280px;
 border-right: 1px solid var(--yorha-border, #606060);
 overflow-y: auto;
 background: var(--yorha-bg-secondary, #1a1a1a);
 display: flex;
 flex-direction: column;
 }

 .search-container {
 position: relative;
 padding: 0.75rem;
 border-bottom: 1px solid var(--yorha-border, #606060);
 background: var(--yorha-bg-secondary, #1a1a1a);
 flex-shrink: 0;
 }

 .search-input {
 width: 100%;
 padding: 0.5rem;
 background: var(--yorha-bg-primary, #0a0a0a);
 border: 1px solid var(--yorha-border, #606060);
 border-radius: 4px;
 color: inherit;
 font-size: 0.85rem;
 }

 .search-input:focus {
 outline: none;
 border-color: var(--yorha-accent, #3cbcfc);
 }

 .search-spinner {
 position: absolute;
 right: 1rem;
 top: 50%;
 transform: translateY(-50%);
 animation: spin 1s linear infinite;
 color: var(--yorha-accent, #3cbcfc);
 }

 @keyframes spin {
 from { transform: translateY(-50%) rotate(0deg); }
 to { transform: translateY(-50%) rotate(360deg); }
 }

 .search-results-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 0.5rem 1rem;
 background: rgba(60, 188, 252, 0.1);
 border-bottom: 1px solid var(--yorha-border, #606060);
 font-size: 0.8rem;
 color: var(--yorha-text-secondary, #a0a0a0);
 flex-shrink: 0;
 }

 .results-count {
 font-weight: 500;
 }

 .clear-search {
 padding: 0.25rem 0.5rem;
 background: transparent;
 border: 1px solid var(--yorha-border, #606060);
 border-radius: 3px;
 cursor: pointer;
 color: var(--yorha-text-secondary, #a0a0a0);
 font-size: 0.75rem;
 }

 .clear-search:hover {
 background: rgba(60, 188, 252, 0.1);
 border-color: var(--yorha-accent, #3cbcfc);
 }

 .no-results {
 padding: 2rem 1rem;
 text-align: center;
 color: var(--yorha-text-secondary, #a0a0a0);
 font-size: 0.85rem;
 }

 .loading, .empty-state, .no-selection {
 padding: 2rem;
 text-align: center;
 color: var(--yorha-text-secondary, #a0a0a0);
 }

 .empty-state button {
 margin-top: 1rem;
 padding: 0.5rem 1rem;
 background: var(--yorha-accent, #3cbcfc);
 color: #000;
 border: none;
 border-radius: 4px;
 cursor: pointer;
 }

 .note-item {
 display: block;
 width: 100%;
 padding: 1rem;
 text-align: left;
 background: transparent;
 border: none;
 border-bottom: 1px solid var(--yorha-border, #606060);
 cursor: pointer;
 color: inherit;
 transition: background 0.2s;
 }

 .note-item:hover {
 background: rgba(60, 188, 252, 0.1);
 }

 .note-item.selected {
 background: rgba(60, 188, 252, 0.2);
 border-left: 3px solid var(--yorha-accent, #3cbcfc);
 }

 .note-item.pinned {
 background: rgba(245, 158, 11, 0.1);
 }

 .note-item-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 0.5rem;
 }

 .note-title {
 font-weight: 600;
 font-size: 0.9rem;
 overflow: hidden;
 text-overflow: ellipsis;
 white-space: nowrap;
 }

 .pin-btn {
 padding: 0.25rem;
 background: transparent;
 border: none;
 cursor: pointer;
 opacity: 0.5;
 transition: opacity 0.2s;
 }

 .pin-btn:hover, .pin-btn.active {
 opacity: 1;
 }

 .note-preview {
 margin: 0;
 font-size: 0.8rem;
 color: var(--yorha-text-secondary, #a0a0a0);
 line-height: 1.4;
 overflow: hidden;
 text-overflow: ellipsis;
 display: -webkit-box;
 -webkit-line-clamp: 2;
 line-clamp: 2;
 -webkit-box-orient: vertical;
 }

 .note-date {
 display: block;
 margin-top: 0.5rem;
 font-size: 0.7rem;
 color: var(--yorha-text-tertiary, #707070);
 }

 .ai-badge {
 display: inline-block;
 margin-top: 0.25rem;
 padding: 0.125rem 0.375rem;
 background: var(--yorha-accent, #3cbcfc);
 color: #000;
 font-size: 0.65rem;
 font-weight: 600;
 border-radius: 2px;
 }

 .editor-panel {
 flex: 1;
 display: flex;
 flex-direction: column;
 overflow: hidden;
 }

 .editor-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 1rem;
 border-bottom: 1px solid var(--yorha-border, #606060);
 gap: 1rem;
 }

 .title-input {
 flex: 1;
 padding: 0.5rem;
 background: var(--yorha-bg-secondary, #1a1a1a);
 border: 1px solid var(--yorha-border, #606060);
 border-radius: 4px;
 color: inherit;
 font-size: 1rem;
 }

 .title-input:focus {
 outline: none;
 border-color: var(--yorha-accent, #3cbcfc);
 }

 .editor-actions {
 display: flex;
 gap: 0.5rem;
 }

 .btn-save {
 padding: 0.5rem 1rem;
 background: var(--yorha-accent, #3cbcfc);
 color: #000;
 border: none;
 border-radius: 4px;
 cursor: pointer;
 font-weight: 500;
 }

 .btn-save:disabled {
 opacity: 0.5;
 cursor: not-allowed;
 }

 .btn-delete {
 padding: 0.5rem;
 background: transparent;
 border: 1px solid #ef4444;
 border-radius: 4px;
 cursor: pointer;
 }

 .btn-delete:hover {
 background: rgba(239, 68, 68, 0.2);
 }

 .editor-body {
 flex: 1;
 padding: 1rem;
 overflow: auto;
 }

 .editor-footer {
 padding: 0.5rem 1rem;
 border-top: 1px solid var(--yorha-border, #606060);
 font-size: 0.75rem;
 color: var(--yorha-text-tertiary, #707070);
 }

 /* Evidence References Styles */
 .evidence-refs {
 border-top: 1px solid var(--yorha-border, #606060);
 background: var(--yorha-bg-secondary, #1a1a1a);
 }

 .evidence-refs h4 {
 margin: 0;
 padding: 1rem;
 font-size: 0.9rem;
 font-weight: 600;
 color: var(--yorha-text-primary, #e0e0e0);
 }

 .loading-refs, .no-refs {
 padding: 1rem;
 text-align: center;
 color: var(--yorha-text-secondary, #a0a0a0);
 font-size: 0.85rem;
 }

 .no-refs small {
 display: block;
 margin-top: 0.5rem;
 color: var(--yorha-text-tertiary, #707070);
 }

 .refs-list {
 max-height: 200px;
 overflow-y: auto;
 }

 .ref-item {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 0.75rem 1rem;
 border-bottom: 1px solid var(--yorha-border, #606060);
 background: rgba(60, 188, 252, 0.05);
 }

 .ref-item:hover {
 background: rgba(60, 188, 252, 0.1);
 }

 .ref-info {
 flex: 1;
 display: flex;
 flex-direction: column;
 gap: 0.25rem;
 }

 .ref-title {
 font-weight: 500;
 font-size: 0.9rem;
 color: var(--yorha-text-primary, #e0e0e0);
 }

 .ref-type {
 font-size: 0.75rem;
 color: var(--yorha-accent, #3cbcfc);
 text-transform: uppercase;
 font-weight: 600;
 }

 .ref-file {
 font-size: 0.75rem;
 color: var(--yorha-text-secondary, #a0a0a0);
 font-style: italic;
 }

 .ref-remove {
 padding: 0.25rem;
 background: transparent;
 border: 1px solid #ef4444;
 border-radius: 3px;
 cursor: pointer;
 color: #ef4444;
 font-size: 0.8rem;
 transition: all 0.2s;
 }

 .ref-remove:hover {
 background: rgba(239, 68, 68, 0.2);
 }
</style>
