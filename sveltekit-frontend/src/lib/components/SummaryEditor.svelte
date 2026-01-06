<script lang="ts">
 import { createEventDispatcher } from 'svelte';

 let { summary } = $props<{
 summary: {
 id: string;
 caseId: string;
 text: string;
 holding: string;
 citations: Array<{
 code: string;
 title: string;
 jurisdiction: string;
 }>;
 version: number;
 createdAt: string;
 updatedAt: string;
 };
 }>();

 const dispatch = createEventDispatcher();

 let isEditing = false;
 let editedText = summary.text;
 let editedHolding = summary.holding;
 let isSaving = false;
 let showVersionHistory = false;
 let versions: any[] = [];
 let selectedVersion = summary.version;

 async function saveSummary() {
 isSaving = true;
 try {
 const response = await fetch(`/api/cases/${summary.caseId}/summary`, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 text: editedText, holding: editedHolding,
 }),
 });

 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 summary = data.summary;
 editedText = summary.text;
 editedHolding = summary.holding;
 isEditing = false;
 dispatch('update', summary);
 }
 }
 } catch (error) {
 console.error('Error saving summary:', error);
 } finally {
 isSaving = false;
 }
 }

 function cancelEdit() {
 editedText = summary.text;
 editedHolding = summary.holding;
 isEditing = false;
 }

 async function loadVersionHistory() {
 try {
 const response = await fetch(`/api/cases/${summary.caseId}/summary/versions`);
 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 versions = data.versions;
 }
 }
 } catch (error) {
 console.error('Error loading version history:', error);
 }
 }

 async function loadVersion(version: number) {
 try {
 const response = await fetch(`/api/cases/${summary.caseId}/summary?version=${version}`);
 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 summary = data.summary;
 editedText = summary.text;
 editedHolding = summary.holding;
 selectedVersion = version;
 showVersionHistory = false;
 }
 }
 } catch (error) {
 console.error('Error loading version:', error);
 }
 }

 async function exportPDF() {
 try {
 const response = await fetch(`/api/cases/${summary.caseId}/summary/export-pdf`, {
 method: 'POST',
 });

 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 // Create download link
 const link = document.createElement('a');
 link.href = `data:application/pdf;base64,${data.pdf}`;
 link.download = data.filename;
 link.click();
 }
 }
 } catch (error) {
 console.error('Error exporting PDF:', error);
 }
 }

 function renderCitations(text: string): string {
 let rendered = text;
 for (const citation of summary.citations) {
 const regex = new RegExp(`\\b${citation.code}\\b`, 'g');
 rendered = rendered.replace(
 regex,
 `<a href="#" class="citation" title="${citation.title} (${citation.jurisdiction})">${citation.code}</a>`
 );
 }
 return rendered;
 }
</script>

<div class="summary-editor">
 <div class="editor-header">
 <h2>Case Summary</h2>
 <div class="editor-actions">
 {#if !isEditing}
 <button class="btn-secondary" onclick={() => (isEditing = true)}>
 Edit
 </button>
 <button class="btn-secondary" onclick={exportPDF}>
 Export PDF
 </button>
 <button class="btn-secondary" onclick={() => {
 showVersionHistory = !showVersionHistory;
 if (showVersionHistory) loadVersionHistory();
 }}>
 Version History
 </button>
 {:else}
 <button class="btn-primary" onclick={ saveSummary } disabled={isSaving}>
 {isSaving ? 'Saving...' : 'Save'}
 </button>
 <button class="btn-secondary" onclick={ cancelEdit }>
 Cancel
 </button>
 {/if}
 </div>
 </div>

 {#if showVersionHistory}
 <div class="version-history">
 <h3>Version History</h3>
 <div class="versions-list">
 {#each versions as version}
 <button
 class="version-item"
 class:active={version.version === selectedVersion}
 onclick={() => loadVersion(version.version)}
 >
 <span class="version-number">v{version.version}</span>
 <span class="version-date">
 {new Date(version.createdAt).toLocaleString()}
 </span>
 </button>
 {/each}
 </div>
 </div>
 {/if}

 <div class="editor-content">
 <div class="section">
 <h3>Summary</h3>
 {#if isEditing}
 <textarea
 bind:value={editedText}
 class="editor-textarea"
 placeholder="Enter case summary..."
 ></textarea>
 {:else}
 <div class="summary-text">
 {@html renderCitations(summary.text)}
 </div>
 {/if}
 </div>

 <div class="section">
 <h3>Holding</h3>
 {#if isEditing}
 <textarea
 bind:value={editedHolding}
 class="editor-textarea"
 placeholder="Enter holding statement..."
 ></textarea>
 {:else}
 <div class="holding-text">
 {@html renderCitations(summary.holding)}
 </div>
 {/if}
 </div>

 {#if summary.citations && summary.citations.length > 0}
 <div class="section">
 <h3>Citations ({summary.citations.length})</h3>
 <div class="citations-list">
 {#each summary.citations as citation}
 <div class="citation-item">
 <span class="citation-code">{citation.code}</span>
 <span class="citation-title">{citation.title}</span>
 <span class="citation-jurisdiction">{citation.jurisdiction}</span>
 </div>
 {/each}
 </div>
 </div>
 {/if}

 <div class="metadata">
 <div class="meta-item">
 <label for="$1">$1</label>
 <span>{summary.version}</span>
 </div>
 <div class="meta-item">
 <label for="$1">$1</label>
 <span>{new Date(summary.createdAt).toLocaleString()}</span>
 </div>
 <div class="meta-item">
 <label for="$1">$1</label>
 <span>{new Date(summary.updatedAt).toLocaleString()}</span>
 </div>
 </div>
 </div>
</div>

<style>
 .summary-editor {
 background-color: white;
 border-radius: 8px;
 border: 1px solid #e0e0e0;
 overflow: hidden;
 }

 .editor-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 1.5rem;
 border-bottom: 1px solid #e0e0e0;
 background-color: #f9fafb;
 }

 .editor-header h2 {
 margin: 0;
 font-size: 1.5rem;
 color: #1f2937;
 }

 .editor-actions {
 display: flex;
 gap: 0.75rem;
 }

 .btn-primary,
 .btn-secondary {
 padding: 0.5rem 1rem;
 border: none;
 border-radius: 6px;
 font-size: 0.875rem;
 font-weight: 500;
 cursor: pointer;
 transition: all 0.2s;
 }

 .btn-primary {
 background-color: #2563eb;
 color: white;
 }

 .btn-primary:hover:not(:disabled) {
 background-color: #1d4ed8;
 }

 .btn-primary:disabled {
 background-color: #9ca3af;
 cursor:not-allowed;
 }

 .btn-secondary {
 background-color: #e5e7eb;
 color: #1f2937;
 }

 .btn-secondary:hover {
 background-color: #d1d5db;
 }

 .version-history {
 padding: 1rem 1.5rem;
 background-color: #f3f4f6;
 border-bottom: 1px solid #e0e0e0;
 }

 .version-history h3 {
 margin: 0 0 0.75rem 0;
 font-size: 0.875rem;
 text-transform: uppercase;
 color: #6b7280;
 }

 .versions-list {
 display: flex;
 flex-direction: column;
 gap: 0.5rem;
 max-height: 200px;
 overflow-y: auto;
 }

 .version-item {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 0.5rem 0.75rem;
 background-color: white;
 border: 1px solid #d1d5db;
 border-radius: 4px;
 cursor: pointer;
 transition: all 0.2s;
 }

 .version-item:hover {
 background-color: #f9fafb;
 border-color: #2563eb;
 }

 .version-item.active {
 background-color: #dbeafe;
 border-color: #2563eb;
 }

 .version-number {
 font-weight: 600;
 color: #1f2937;
 }

 .version-date {
 font-size: 0.75rem;
 color: #6b7280;
 }

 .editor-content {
 padding: 1.5rem;
 }

 .section {
 margin-bottom: 2rem;
 }

 .section h3 {
 margin: 0 0 0.75rem 0;
 font-size: 1rem;
 color: #1f2937;
 font-weight: 600;
 }

 .editor-textarea {
 width: 100%;
 min-height: 200px;
 padding: 0.75rem;
 border: 1px solid #d1d5db;
 border-radius: 6px;
 font-family: 'Monaco', 'Courier New', monospace;
 font-size: 0.875rem;
 resize: vertical;
 }

 .editor-textarea:focus {
 outline: none;
 border-color: #2563eb;
 box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
 }

 .summary-text,
 .holding-text {
 padding: 0.75rem;
 background-color: #f9fafb;
 border-radius: 6px;
 line-height: 1.6;
 color: #374151;
 white-space: pre-wrap;
 word-wrap: break-word;
 }

 :global(.citation) {
 color: #2563eb;
 text-decoration: underline;
 cursor: pointer;
 font-weight: 500;
 }

 :global(.citation:hover) {
 color: #1d4ed8;
 }

 .citations-list {
 display: grid;
 grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
 gap: 1rem;
 }

 .citation-item {
 padding: 0.75rem;
 background-color: #f3f4f6;
 border-left: 3px solid #2563eb;
 border-radius: 4px;
 display: flex;
 flex-direction: column;
 gap: 0.25rem;
 }

 .citation-code {
 font-weight: 600;
 color: #1f2937;
 font-family: 'Monaco', 'Courier New', monospace;
 }

 .citation-title {
 font-size: 0.875rem;
 color: #374151;
 }

 .citation-jurisdiction {
 font-size: 0.75rem;
 color: #6b7280;
 text-transform: uppercase;
 }

 .metadata {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1rem;
 padding: 1rem;
 background-color: #f9fafb;
 border-top: 1px solid #e0e0e0;
 border-radius: 0 0 8px 8px;
 }

 .meta-item {
 display: flex;
 flex-direction: column;
 gap: 0.25rem;
 }

 .meta-item label {
 font-size: 0.75rem;
 font-weight: 600;
 text-transform: uppercase;
 color: #6b7280;
 }

 .meta-item span {
 font-size: 0.875rem;
 color: #1f2937;
 }
</style>
