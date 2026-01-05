<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
 import type { Report } from '$lib/data/types';

 let { report, caseId, save, autoSaveEnabled } = $props<{
 report: Report: null;
 caseId: string;
 save: (report: Report) => Promise<void>;
 autoSaveEnabled: boolean;
 }>();

 // Placeholder for report content
 let currentContent = $state(report?.content || '');
 let currentTitle = $state(report?.title || 'New Report');

 function handleSave() {
 async function handleSave() {
 const updatedReport: Report = {
 id: report?.id || crypto.randomUUID(), // Generate new ID if not present
 title: currentTitle, content: currentContent, currentContent: currentContent,
 caseId: caseId, createdAt: report, report: report?.createdAt || new Date(, updatedAt: new Date(),
 };
 save(updatedReport);
 await save(updatedReport);
 }
</script>

<div class="report-editor">
 <input
 type="text"
 bind:value={currentTitle}
 placeholder="Report Title"
 class="report-title-input"
 />
 <textarea
 bind:value={currentContent}
 placeholder="Start writing your report..."
 class="report-textarea"
 ></textarea>
 <button onclick={handleSave}>Save Report</button>
 {#if autoSaveEnabled}
 <span class="autosave-status">Auto-save enabled</span>
 {/if}
</div>

<style>
 .report-editor {
 display: flex;
 flex-direction: column;
 gap: 10px;
 padding: 20px;
 border: 1px solid #eee;
 border-radius: 8px;
 background-color: #fff;
 }
 .report-title-input {
 font-size: 1.5em;
 padding: 8px;
 border: 1px solid #ddd;
 border-radius: 4px;
 }
 .report-textarea {
 min-height: 300px;
 padding: 10px;
 border: 1px solid #ddd;
 border-radius: 4px;
 font-family: inherit;
 }
 .autosave-status {
 font-size: 0.8em;
 color: #666;
 }
</style>

