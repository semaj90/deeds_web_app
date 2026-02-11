<script lang="ts">
 import NierRichTextEditor from '$lib/components/editors/NierRichTextEditor.svelte';
 // Migrated to $effect

 interface CaseNote {
 id: string;
	caseId: string;
 title: string | null;
 content: string;
	isAI: boolean;
 isPinned: boolean;
	createdBy: string | null; // Changed from number to string for UUID
 createdAt: string;
	updatedAt: string }

 interface EvidenceRef {
 id: string;
	evidenceId: string;
 title: string;
	evidenceType: string;
 fileName?: string }

 interface Props {
 caseId: string;
 onClose?: () => void }

 let { caseId, onClose }: Props = $props();

 type NoteHit = {
 id: string;
 title?: string | null;
 contentPreview?: string | null;
 createdAt?: string;
 updatedAt?: string;
 pinned?: boolean;
 score?: number };

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
			return }

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
				title: x.title ?? null,
				contentPreview: x.contentPreview ?? x.preview ?? x.snippet ?? null,
				createdAt: x.createdAt ?? null,
				updatedAt: x.updatedAt ?? null,
				pinned: !!x.pinned,
				score: typeof x.score === "number" ? x.score  | undefined
			}));
		} catch (e: any) {
			searchError = e?.message ?? "Search error";
			searchHits = [];
		} finally {
			searching = false }
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
			return }

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
			searchError = null }
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
 },
	800);
 });

 $effect(() => {

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
			isLoading = false }
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
		isNewNote = true }

	async function saveNote() {
		if (!noteContent.trim()) {
			error = 'Note content cannot be empty';
			return }

		isSaving = true;
		error = null;

		try {
			if (isNewNote) {
				// Create new note
				const response = await fetch(`/api/cases/${caseId}/notes`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	title:noteTitle.trim() || null,
						content:noteContent.trim(),
					}),
				});

				if (!response.ok) throw new Error('Failed to create note');
				const data = await response.json();
				notes = sortNotes([data.note, ...notes]);
				selectedNote = data.note;
				isNewNote = false;

				// Update baselines after successful save
				lastSavedTitle = data.note.title || '';
				lastSavedContent = data.note.content } else if (selectedNote) {
				// Update existing note
				const response = await fetch(`/api/cases/${caseId}/notes/${selectedNote.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	title:noteTitle.trim() || null,
						content:noteContent.trim(),
					}),
				});

				if (!response.ok) throw new Error('Failed to update note');
				const data = await response.json();
				notes = sortNotes(notes.map(n => n.id === data.note.id ? data.note : n));
				selectedNote = data.note;

				// Update baselines after successful save
				lastSavedTitle = data.note.title || '';
				lastSavedContent = data.note.content }
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save note';
		} finally {
			isSaving = false }
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
				isNewNote = false }
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete note';
		}
	}

	async function togglePin(note: CaseNote) {
		try {
			const response = await fetch(`/api/cases/${caseId}/notes/${note.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	isPinned: !note.isPinned })
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
			isLoadingRefs = false }
	}

	async function removeEvidenceRef(noteId: string, evidenceId: string) {
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
 return }

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
 body { font-family: Arial, sans-serif, margin: 40px; line-height: 1.6;}
 h1 { color: #333;}
 pre { white-space: pre-wrap;
	background: #f5f5f5;
		padding: 20px; border-radius: 5px;}
 </style>




