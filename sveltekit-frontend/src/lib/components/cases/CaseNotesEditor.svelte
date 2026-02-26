<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface CaseNote {
		id: string;
		caseId: string;
		title: string | null;
		content: string;
		isAI: boolean;
		isPinned: boolean;
		createdBy: string | null;
		createdAt: string;
		updatedAt: string;
	}

	interface NoteVersion {
		id: string;
		noteId: string;
		title: string | null;
		content: string;
		versionNumber: number;
		createdAt: string;
	}

	interface Props {
		caseId: string;
		onClose?: () => void;
	}

	let { caseId, onClose }: Props = $props();

	let notes = $state<CaseNote[]>([]);
	let selectedNote = $state<CaseNote | null>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let error = $state<string | null>(null);

	let noteTitle = $state('');
	let noteContent = $state('');
	let isNewNote = $state(false);

	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	let lastSavedTitle = $state('');
	let lastSavedContent = $state('');

	// Version history
	let versions = $state<NoteVersion[]>([]);
	let showVersions = $state(false);
	let versionsLoading = $state(false);
	let selectedVersion = $state<NoteVersion | null>(null);
	let showDiffView = $state(true);

	interface DiffLine {
		type: 'added' | 'removed' | 'unchanged';
		text: string;
	}

	function truncate(text: string, max: number): string {
		if (!text) return '';
		const clean = text.replace(/\n/g, ' ').trim();
		return clean.length > max ? clean.slice(0, max) + '...' : clean;
	}

	function computeLineDiff(oldText: string, newText: string): DiffLine[] {
		const oldLines = oldText.split('\n');
		const newLines = newText.split('\n');
		const result: DiffLine[] = [];
		let oi = 0;
		let ni = 0;
		const lookahead = 5;

		while (oi < oldLines.length || ni < newLines.length) {
			if (oi >= oldLines.length) {
				result.push({ type: 'added', text: newLines[ni] });
				ni++;
			} else if (ni >= newLines.length) {
				result.push({ type: 'removed', text: oldLines[oi] });
				oi++;
			} else if (oldLines[oi] === newLines[ni]) {
				result.push({ type: 'unchanged', text: oldLines[oi] });
				oi++;
				ni++;
			} else {
				let foundOld = -1;
				let foundNew = -1;
				for (let k = 1; k <= lookahead; k++) {
					if (ni + k < newLines.length && oldLines[oi] === newLines[ni + k]) {
						foundNew = ni + k;
						break;
					}
				}
				for (let k = 1; k <= lookahead; k++) {
					if (oi + k < oldLines.length && oldLines[oi + k] === newLines[ni]) {
						foundOld = oi + k;
						break;
					}
				}
				if (foundNew !== -1 && (foundOld === -1 || foundNew - ni <= foundOld - oi)) {
					for (let k = ni; k < foundNew; k++) {
						result.push({ type: 'added', text: newLines[k] });
					}
					ni = foundNew;
				} else if (foundOld !== -1) {
					for (let k = oi; k < foundOld; k++) {
						result.push({ type: 'removed', text: oldLines[k] });
					}
					oi = foundOld;
				} else {
					result.push({ type: 'removed', text: oldLines[oi] });
					result.push({ type: 'added', text: newLines[ni] });
					oi++;
					ni++;
				}
			}
		}
		return result;
	}

	let diffLines = $derived.by(() => {
		if (!selectedVersion || !selectedNote) return [];
		return computeLineDiff(selectedVersion.content, noteContent);
	});

	let diffStats = $derived.by(() => {
		let added = 0;
		let removed = 0;
		for (const line of diffLines) {
			if (line.type === 'added') added++;
			if (line.type === 'removed') removed++;
		}
		return { added, removed };
	});

	function sortNotes(list: CaseNote[]) {
		return [...list].sort((a, b) => {
			if (a.isPinned && !b.isPinned) return -1;
			if (!a.isPinned && b.isPinned) return 1;
			return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
		});
	}

	// Autosave effect
	$effect(() => {
		if (!selectedNote && !isNewNote) return;
		if (noteTitle === lastSavedTitle && noteContent === lastSavedContent) return;
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			if (isNewNote) return;
			if (noteContent.trim()) saveNote();
		}, 800);
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
			isLoading = false;
		}
	}

	function selectNote(note: CaseNote) {
		selectedNote = note;
		noteTitle = note.title || '';
		noteContent = note.content;
		isNewNote = false;
		lastSavedTitle = note.title || '';
		lastSavedContent = note.content;
		showVersions = false;
		selectedVersion = null;
		versions = [];
	}

	function startNewNote() {
		selectedNote = null;
		noteTitle = '';
		noteContent = '';
		isNewNote = true;
		showVersions = false;
		selectedVersion = null;
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
				const response = await fetch(`/api/cases/${caseId}/notes`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title: noteTitle.trim() || null, content: noteContent.trim() }),
				});
				if (!response.ok) throw new Error('Failed to create note');
				const data = await response.json();
				notes = sortNotes([data.note, ...notes]);
				selectedNote = data.note;
				isNewNote = false;
				lastSavedTitle = data.note.title || '';
				lastSavedContent = data.note.content;
			} else if (selectedNote) {
				const response = await fetch(`/api/cases/${caseId}/notes/${selectedNote.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title: noteTitle.trim() || null, content: noteContent.trim() }),
				});
				if (!response.ok) throw new Error('Failed to update note');
				const data = await response.json();
				notes = sortNotes(notes.map((n) => (n.id === data.note.id ? data.note : n)));
				selectedNote = data.note;
				lastSavedTitle = data.note.title || '';
				lastSavedContent = data.note.content;
				// Refresh versions if panel is open
				if (showVersions) {
					loadVersions(data.note.id);
				}
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
			const response = await fetch(`/api/cases/${caseId}/notes/${noteId}`, { method: 'DELETE' });
			if (!response.ok) throw new Error('Failed to delete note');
			notes = notes.filter((n) => n.id !== noteId);
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
			notes = sortNotes(notes.map((n) => (n.id === data.note.id ? data.note : n)));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to pin note';
		}
	}

	async function loadVersions(noteId: string) {
		versionsLoading = true;
		try {
			const res = await fetch(`/api/cases/${caseId}/notes/${noteId}/versions`);
			if (!res.ok) throw new Error('Failed to load versions');
			const data = await res.json();
			versions = data.versions || [];
		} catch {
			versions = [];
		} finally {
			versionsLoading = false;
		}
	}

	function toggleVersionHistory() {
		if (!selectedNote) return;
		showVersions = !showVersions;
		if (showVersions && versions.length === 0) {
			loadVersions(selectedNote.id);
		}
		selectedVersion = null;
	}

	function viewVersion(v: NoteVersion) {
		selectedVersion = v;
		showDiffView = true;
	}

	function restoreVersion(v: NoteVersion) {
		noteTitle = v.title || '';
		noteContent = v.content;
		selectedVersion = null;
		showVersions = false;
	}

	function formatDate(d: string) {
		return new Date(d).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}
</script>

<div class="cne-root">
	<div class="cne-header">
		<h2>Case Notes</h2>
		<div class="cne-header-actions">
			<button class="cne-btn cne-btn-primary" onclick={startNewNote}>
				<Icon name="plus" size={14} /> New
			</button>
			{#if onClose}
				<button class="cne-btn" onclick={onClose}>
					<Icon name="x" size={14} />
				</button>
			{/if}
		</div>
	</div>

	{#if error}
		<div class="cne-error">{error}</div>
	{/if}

	<div class="cne-body">
		<!-- Note List -->
		<div class="cne-list">
			{#if isLoading}
				<p class="cne-empty">Loading...</p>
			{:else if notes.length === 0}
				<p class="cne-empty">No notes yet</p>
			{:else}
				{#each notes as note (note.id)}
					<button
						class="cne-note-item"
						class:active={selectedNote?.id === note.id}
						onclick={() => selectNote(note)}
					>
						<div class="cne-note-title">
							{#if note.isPinned}<Icon name="pin" size={12} />{/if}
							{#if note.isAI}<Icon name="bot" size={12} />{/if}
							{note.title || 'Untitled'}
						</div>
						<div class="cne-note-meta">{formatDate(note.updatedAt)}</div>
					</button>
				{/each}
			{/if}
		</div>

		<!-- Editor Panel -->
		<div class="cne-editor">
			{#if isNewNote || selectedNote}
				<div class="cne-editor-toolbar">
					<input
						type="text"
						bind:value={noteTitle}
						placeholder="Note title..."
						class="cne-title-input"
					/>
					<div class="cne-toolbar-actions">
						{#if selectedNote}
							<button
								class="cne-btn cne-btn-sm"
								onclick={() => togglePin(selectedNote)}
								title={selectedNote.isPinned ? 'Unpin' : 'Pin'}
							>
								<Icon name="pin" size={14} />
							</button>
							<button
								class="cne-btn cne-btn-sm"
								class:active={showVersions}
								onclick={toggleVersionHistory}
								title="Version History"
							>
								<Icon name="git-branch" size={14} /> History
							</button>
							<button
								class="cne-btn cne-btn-sm cne-btn-danger"
								onclick={() => deleteNote(selectedNote.id)}
								title="Delete"
							>
								<Icon name="trash-2" size={14} />
							</button>
						{/if}
						<button
							class="cne-btn cne-btn-primary cne-btn-sm"
							onclick={saveNote}
							disabled={isSaving}
						>
							{isSaving ? 'Saving...' : 'Save'}
						</button>
					</div>
				</div>

				<textarea
					bind:value={noteContent}
					placeholder="Write your note..."
					class="cne-textarea"
				></textarea>

				<!-- Version History Panel -->
				{#if showVersions}
					<div class="cne-versions">
						<h3 class="cne-versions-title">
							<Icon name="git-branch" size={14} />
							Version History
							{#if versionsLoading}
								<span class="cne-loading">loading...</span>
							{/if}
						</h3>
						{#if versions.length === 0 && !versionsLoading}
							<p class="cne-empty">No previous versions</p>
						{:else}
							<div class="cne-version-list">
								{#each versions as v (v.id)}
									<div class="cne-version-item" class:active={selectedVersion?.id === v.id}>
										<button class="cne-version-info" onclick={() => viewVersion(v)}>
											<span class="cne-version-num">v{v.versionNumber}</span>
											<span class="cne-version-date">{formatDate(v.createdAt)}</span>
											<span class="cne-version-preview">{truncate(v.content, 100)}</span>
										</button>
										<button class="cne-btn cne-btn-xs" onclick={() => restoreVersion(v)}>
											<Icon name="rotate-ccw" size={11} /> Restore
										</button>
									</div>
								{/each}
							</div>

							{#if selectedVersion}
								<div class="cne-version-diff">
									<div class="cne-diff-header">
										<h4>
											<Icon name="git-compare" size={14} />
											Version {selectedVersion.versionNumber} — {formatDate(selectedVersion.createdAt)}
										</h4>
										<div class="cne-diff-controls">
											<span class="cne-diff-stat">
												<span class="cne-diff-stat-added">+{diffStats.added}</span>
												<span class="cne-diff-stat-removed">-{diffStats.removed}</span>
											</span>
											<button
												class="cne-btn cne-btn-xs"
												class:active={showDiffView}
												onclick={() => showDiffView = true}
											>
												Diff
											</button>
											<button
												class="cne-btn cne-btn-xs"
												class:active={!showDiffView}
												onclick={() => showDiffView = false}
											>
												Full
											</button>
										</div>
									</div>
									{#if selectedVersion.title}
										<div class="cne-diff-title">Title: {selectedVersion.title}</div>
									{/if}
									{#if showDiffView}
										<div class="cne-diff-lines">
											{#each diffLines as line}
												<div class="cne-diff-line cne-diff-{line.type}">
													<span class="cne-diff-prefix">{line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>{line.text}
												</div>
											{/each}
										</div>
									{:else}
										<pre class="cne-diff-content">{selectedVersion.content}</pre>
									{/if}
								</div>
							{/if}
						{/if}
					</div>
				{/if}
			{:else}
				<div class="cne-placeholder">
					<Icon name="file-text" size={48} />
					<p>Select a note or create a new one</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.cne-root {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #111827;
		color: #d1d5db;
		font-size: 0.9rem;
	}

	.cne-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #374151;
	}

	.cne-header h2 {
		margin: 0;
		color: #ffffff;
		font-size: 1.1rem;
	}

	.cne-header-actions {
		display: flex;
		gap: 0.5rem;
	}

	.cne-error {
		padding: 0.5rem 1rem;
		background: #7f1d1d;
		color: #fecaca;
		font-size: 0.8rem;
	}

	.cne-body {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.cne-list {
		width: 200px;
		border-right: 1px solid #374151;
		overflow-y: auto;
	}

	.cne-note-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.75rem 1rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid #1f2937;
		color: #d1d5db;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.cne-note-item:hover {
		background: #1f2937;
	}

	.cne-note-item.active {
		background: #1e3a5f;
		border-left: 3px solid #3b82f6;
	}

	.cne-note-title {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-weight: 600;
		font-size: 0.85rem;
		color: #ffffff;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cne-note-meta {
		font-size: 0.7rem;
		color: #6b7280;
		margin-top: 0.25rem;
	}

	.cne-editor {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.cne-editor-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid #374151;
	}

	.cne-title-input {
		flex: 1;
		padding: 0.4rem 0.6rem;
		background: #1f2937;
		border: 1px solid #374151;
		border-radius: 0.25rem;
		color: #ffffff;
		font-size: 0.85rem;
	}

	.cne-title-input:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.cne-toolbar-actions {
		display: flex;
		gap: 0.375rem;
	}

	.cne-textarea {
		flex: 1;
		padding: 1rem;
		background: #0f172a;
		border: none;
		color: #e5e7eb;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.85rem;
		line-height: 1.6;
		resize: none;
	}

	.cne-textarea:focus {
		outline: none;
	}

	.cne-btn {
		padding: 0.4rem 0.75rem;
		background: #374151;
		color: #d1d5db;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		font-size: 0.8rem;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		transition: background-color 0.15s;
	}

	.cne-btn:hover {
		background: #4b5563;
	}

	.cne-btn-primary {
		background: #2563eb;
		color: #ffffff;
	}

	.cne-btn-primary:hover {
		background: #1d4ed8;
	}

	.cne-btn-danger {
		background: #7f1d1d;
		color: #fecaca;
	}

	.cne-btn-danger:hover {
		background: #991b1b;
	}

	.cne-btn-sm {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
	}

	.cne-btn-sm.active {
		background: #1e3a5f;
		color: #93c5fd;
	}

	.cne-btn-xs {
		padding: 0.15rem 0.4rem;
		font-size: 0.7rem;
		background: #374151;
		color: #93c5fd;
		border: none;
		border-radius: 0.2rem;
		cursor: pointer;
	}

	.cne-btn-xs:hover {
		background: #4b5563;
	}

	.cne-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.cne-placeholder {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #6b7280;
		gap: 1rem;
	}

	.cne-empty {
		color: #6b7280;
		text-align: center;
		padding: 2rem 1rem;
		font-size: 0.85rem;
	}

	.cne-versions {
		border-top: 1px solid #374151;
		padding: 0.75rem 1rem;
		max-height: 350px;
		overflow-y: auto;
		background: #0f172a;
	}

	.cne-versions-title {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: #93c5fd;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.cne-loading {
		font-size: 0.7rem;
		color: #6b7280;
		font-weight: normal;
	}

	.cne-version-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.cne-version-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		transition: background-color 0.15s;
	}

	.cne-version-item:hover {
		background: #1e293b;
	}

	.cne-version-item.active {
		background: #1e3a5f;
	}

	.cne-version-info {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		background: none;
		border: none;
		color: #d1d5db;
		cursor: pointer;
		padding: 0.2rem 0;
		font-size: 0.8rem;
		flex: 1;
		min-width: 0;
	}

	.cne-version-num {
		color: #93c5fd;
		font-weight: 600;
		font-size: 0.75rem;
		flex-shrink: 0;
	}

	.cne-version-date {
		color: #6b7280;
		font-size: 0.7rem;
		flex-shrink: 0;
	}

	.cne-version-diff {
		margin-top: 0.75rem;
		padding: 0.75rem;
		background: #1e293b;
		border-radius: 0.375rem;
		border: 1px solid #374151;
	}

	.cne-version-diff h4 {
		margin: 0;
		color: #93c5fd;
		font-size: 0.8rem;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.cne-diff-title {
		color: #9ca3af;
		font-size: 0.8rem;
		margin-bottom: 0.5rem;
		font-style: italic;
	}

	.cne-diff-content {
		margin: 0;
		white-space: pre-wrap;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		color: #d1d5db;
		max-height: 200px;
		overflow-y: auto;
		line-height: 1.5;
	}

	.cne-version-preview {
		color: #9ca3af;
		font-size: 0.7rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.cne-diff-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.cne-diff-controls {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.cne-diff-stat {
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', monospace;
		display: flex;
		gap: 0.375rem;
	}

	.cne-diff-stat-added {
		color: #4ade80;
	}

	.cne-diff-stat-removed {
		color: #f87171;
	}

	.cne-btn-xs.active {
		background: #1e3a5f;
		color: #93c5fd;
	}

	.cne-diff-lines {
		max-height: 200px;
		overflow-y: auto;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		line-height: 1.5;
		border-radius: 0.25rem;
		overflow-x: auto;
	}

	.cne-diff-line {
		white-space: pre-wrap;
		word-break: break-all;
		padding: 0 0.5rem;
	}

	.cne-diff-prefix {
		display: inline-block;
		width: 1.25rem;
		color: #6b7280;
		user-select: none;
		flex-shrink: 0;
	}

	.cne-diff-added {
		background: rgba(34, 197, 94, 0.15);
		color: #bbf7d0;
	}

	.cne-diff-added .cne-diff-prefix {
		color: #4ade80;
	}

	.cne-diff-removed {
		background: rgba(239, 68, 68, 0.15);
		color: #fecaca;
	}

	.cne-diff-removed .cne-diff-prefix {
		color: #f87171;
	}

	.cne-diff-unchanged {
		color: #9ca3af;
	}
</style>
