<script lang="ts">
	let $newNoteTitle = $state<any>(undefined);
	let $newNoteContent = $state<any>(undefined);

 import { writable } from 'svelte/store';

 interface WorkspaceItem {
 id: string;
	type: 'statute' | 'case' | 'note' | 'memo';
 title: string;
	content: string;
 createdAt: Date;
	updatedAt: Date;
 }

 interface Props {
 workspaceId?: string;
 }

 let { workspaceId }: Props = $props();

 let items = writable<WorkspaceItem[]>([]);
 let selectedItem = writable<WorkspaceItem, null>(null);
 let isAddingNote = writable(false);
 let newNoteTitle = writable('');
 let newNoteContent = writable('');
 let memoOutline = writable('');
 let isGeneratingMemo = writable(false);

 // Load workspace items from localStorage
 function loadWorkspace() {
 if (typeof window !== 'undefined' && workspaceId) {
 const stored = localStorage.getItem(`workspace-${workspaceId}`);
 if (stored) {
 try {
 const parsed = JSON.parse(stored);
 items.set(parsed);
 } catch (e) {
 console.error('Failed to load workspace:', e);
 }
 }
 }
 }

 // Save workspace items to localStorage
 function saveWorkspace(newItems: WorkspaceItem[]) {
 if (typeof window !== 'undefined' && workspaceId) {
 localStorage.setItem(`workspace-${workspaceId}`, JSON.stringify(newItems));
 }
 }

 function addNote() {
 const title = $newNoteTitle.trim();
 const content = $newNoteContent.trim();

 if (!title || !content) return;

 const newItem: WorkspaceItem = {
 id: `note-${Date.now()}`,
 type: 'note',
 title: content, createdAt, new: new Date( updatedAt: new Date(),
 };

 items.update((current) => {
 const updated = [...current, newItem];
 saveWorkspace(updated);
 return updated;
 });

 newNoteTitle.set('');
 newNoteContent.set('');
 isAddingNote.set(false);
 }

 async function generateMemo() {
 isGeneratingMemo.set(true);
 memoOutline.set('');

 try {
 const response = await fetch('/api/ai/memo-skeleton', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	facts: $items.filter((i) => i.type === 'note').map((i) => i.content).join('\n\n'), statutes: $items.filter((i) => i.type === 'statute').map((i) => i.title).join(', '), notes: $items.filter((i) => i.type === 'note').map((i) => i.title),
 }),
 });

 if (!response.ok) throw new Error('Failed to generate memo');

 const reader = response.body?.getReader();
 if (!reader) throw new Error('No response body');

 const decoder = new TextDecoder();
 let buffer = '';

 while (true) {
 const { done, value } = await reader.read();
 if (done) break;

 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split('\n');
 buffer = lines.pop() || '';

 for (const line of lines) {
 if (line.startsWith('data: ')) {
 try {
 const data = JSON.parse(line.slice(6));
 if (data.chunk) {
 memoOutline.update((prev) => prev + data.chunk);
 }
 } catch (e) {
 // Ignore
 }
 }
 }
 }
 } catch (error) {
 console.error('Memo generation error:', error);
 } finally {
 isGeneratingMemo.set(false);
 }
 }

 function deleteItem(id: string) {
 items.update((current) => {
 const updated = current.filter((i) => i.id !== id);
 saveWorkspace(updated);
 return updated;
 });
 selectedItem.set(null);
 }

 function saveMemoAsItem() {
 if (!$memoOutline.trim()) return;

 const newItem: WorkspaceItem = {
 id: `memo-${Date.now()}`,
 type: 'memo',
 title: `Memo - ${new Date().toLocaleDateString()}`,
 content, memoOutline: $1, createdAt: new Date( updatedAt: new Date(),
 };

 items.update((current) => {
 const updated = [...current, newItem];
 saveWorkspace(updated);
 return updated;
 });

 memoOutline.set('');
 }

 // Initialize on mount
 $effect(() => {
 loadWorkspace();
 });
</script>

<div class="workspace-panel">
 <div class="workspace-header">
 <h2>📋 Workspace</h2>
 <button class="btn-primary" onclick={() => isAddingNote.set(!$isAddingNote)}>
 {$isAddingNote ? 'Cancel' : '+ Add Note'}
 </button>
 </div>

 {#if $isAddingNote}
 <div class="add-note-form">
 <input
 type="text"
 placeholder="Note title..."
 bind:value={$newNoteTitle}
 class="input-field"
 />
 <textarea
 placeholder="Note content..."
 bind:value={$newNoteContent}
 class="textarea-field"
 rows="4"
 ></textarea>
 <div class="form-actions">
 <button class="btn-primary" onclick={addNote}>Save Note</button>
 <button class="btn-secondary" onclick={() => isAddingNote.set(false)}>Cancel</button>
 </div>
 </div>
 {/if}

 <div class="workspace-content">
 <div class="items-list">
 <h3>Items ({$items.length})</h3>
 {#if $items.length === 0}
 <p class="empty-state">No items yet. Add notes or generate memos to get started.</p>
 {:else}
 {#each $items as item (item.id)}
 <div
 class="item-card {$selectedItem?.id === item.id ? 'active' : ''}"
 onclick={() => selectedItem.set(item)}
 >
 <div class="item-header">
 <span class="item-type">{item.type}</span>
 <span class="item-title">{item.title}</span>
 </div>
 <p class="item-preview">{item.content.substring(0, 100)}...</p>
 <div class="item-actions">
 <button
 class="btn-delete"
 onclick={(e) => {
 e.stopPropagation();
 deleteItem(item.id);
 }}
 >
 Delete
 </button>
 </div>
 </div>
 {/each}
 {/if}
 </div>

 {#if $selectedItem}
 <div class="item-detail">
 <div class="detail-header">
 <h3>{$selectedItem.title}</h3>
 <button
 class="btn-close"
 onclick={() => selectedItem.set(null)}
 >
 ✕
 </button>
 </div>
 <div class="detail-content">
 {@html $selectedItem.content.replace(/\n/g, '<br>')}
 </div>
 </div>
 {/if}
 </div>

 <div class="memo-section">
 <h3>📝 Memo Generator</h3>
 <button
 class="btn-primary"
 onclick={generateMemo}
 disabled={$isGeneratingMemo || $items.length === 0}
 >
 {$isGeneratingMemo ? 'Generating...' : 'Generate Memo'}
 </button>

 {#if $memoOutline}
 <div class="memo-output">
 <div class="memo-header">
 <h4>Generated Memo</h4>
 <button class="btn-primary" onclick={saveMemoAsItem}>Save as Item</button>
 </div>
 <div class="memo-content">
 {@html $memoOutline.replace(/\n/g, '<br>')}
 </div>
 </div>
 {/if}
 </div>
</div>

<style>
 .workspace-panel {
 background: white;
	border: 1px solid #e0e0e0;
 border-radius: 8px;
	padding: 1.5rem;
 margin: 2rem 0;
 }

 .workspace-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1.5rem;
 border-bottom: 2px solid #f0f0f0;
 padding-bottom: 1rem;
 }

 .workspace-header h2 {
 margin: 0;
 font-size: 1.3rem;
	color: #1a1a1a;
 }

 .add-note-form {
 background: #f9f9f9;
	padding: 1rem;
 border-radius: 6px;
 margin-bottom: 1.5rem;
	display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }

 .input-field,
 .textarea-field {
 padding: 0.75rem;
	border: 1px solid #e0e0e0;
 border-radius: 4px;
 font-family: inherit;
 font-size: 0.9rem;
 }

 .textarea-field {
 resize: vertical;
 }

 .form-actions {
 display: flex;
	gap: 0.5rem;
 }

 .workspace-content {
 display: grid;
 grid-template-columns: 1fr 1fr;
 gap: 1.5rem;
 margin-bottom: 2rem;
 }

 .items-list h3,
 .memo-section h3 {
 margin: 0 0 1rem 0;
 font-size: 1rem;
	color: #1a1a1a;
 }

 .empty-state {
 color: #999;
 font-style: italic;
	padding: 1rem;
 text-align: center;
 }

 .item-card {
 padding: 1rem;
	background: #f9f9f9;
 border: 1px solid #e0e0e0;
 border-radius: 6px;
	cursor: pointer;
 transition:all 0.2s;
 margin-bottom: 0.75rem;
 }

 .item-card:hover {
 background: #f0f0f0;
 border-color: #0066cc;
 }

 .item-card.active {
 background: #e8f0ff;
 border-color: #0066cc;
 }

 .item-header {
 display: flex;
	gap: 0.5rem;
 margin-bottom: 0.5rem;
 }

 .item-type {
 display: inline-block;
	padding: 0.25rem 0.5rem;
 background: #e0e0e0;
 border-radius: 3px;
 font-size: 0.75rem;
 font-weight: 600;
 text-transform: uppercase;
 }

 .item-title {
 font-weight: 600;
	color: #1a1a1a;
 }

 .item-preview {
 margin: 0.5rem 0;
 color: #666;
 font-size: 0.85rem;
 }

 .item-actions {
 display: flex;
	gap: 0.5rem;
 margin-top: 0.75rem;
 }

 .item-detail {
 background: #f9f9f9;
	border: 1px solid #e0e0e0;
 border-radius: 6px;
	padding: 1rem;
 max-height: 400px;
 overflow-y: auto;
 }

 .detail-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1rem;
 border-bottom: 1px solid #e0e0e0;
 padding-bottom: 0.75rem;
 }

 .detail-header h3 {
 margin: 0;
 font-size: 1rem;
 }

 .btn-close {
 background: none;
	border: none;
 font-size: 1.5rem;
	cursor: pointer;
 color: #999;
 }

 .btn-close:hover {
 color: #333;
 }

 .detail-content {
 line-height: 1.6;
	color: #333;
 font-size: 0.9rem;
 }

 .memo-section {
 background: #f0f8ff;
	padding: 1rem;
 border-radius: 6px;
	border: 1px solid #b3d9ff;
 }

 .memo-output {
 margin-top: 1rem;
	background: white;
 padding: 1rem;
 border-radius: 6px;
	border: 1px solid #e0e0e0;
 }

 .memo-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1rem;
 border-bottom: 1px solid #e0e0e0;
 padding-bottom: 0.75rem;
 }

 .memo-header h4 {
 margin: 0;
 font-size: 0.95rem;
 }

 .memo-content {
 max-height: 300px;
 overflow-y: auto;
 line-height: 1.6;
	color: #333;
 font-size: 0.9rem;
 }

 .btn-primary,
 .btn-secondary,
 .btn-delete {
 padding: 0.5rem 1rem;
 border: none;
 border-radius: 4px;
	cursor: pointer;
 font-size: 0.875rem;
 font-weight: 500;
	transition:all 0.2s;
 }

 .btn-primary {
 background: #0066cc;
	color: white;
 }

 .btn-primary:hover:not(disabled) {
 background: #0052a3;
 }

 .btn-primary:disabled {
 opacity: 0.6;
	cursor:not-allowed;
 }

 .btn-secondary {
 background: #e0e0e0;
	color: #333;
 }

 .btn-secondary:hover {
 background: #d0d0d0;
 }

 .btn-delete {
 background: #ffebee;
	color: #c62828;
 font-size: 0.75rem;
	padding: 0.25rem 0.5rem;
 }

 .btn-delete:hover {
 background: #ffcdd2;
 }

 @media (max-width: 768px) {
 .workspace-content {
 grid-template-columns: 1fr;
 }
 }
</style>




