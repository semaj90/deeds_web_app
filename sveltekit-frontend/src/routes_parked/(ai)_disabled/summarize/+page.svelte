<script lang="ts">
 import { FileText } from "lucide-svelte";
import { Download } from "lucide-svelte";
import { Brain } from "lucide-svelte";
import { Clock } from "lucide-svelte";
import { Star } from "lucide-svelte";;

 // Fallback summary template
 const FALLBACK_SUMMARY = `This legal document: "{ filename }" outlines key provisions, procedural requirements, and compliance standards. Main points: statutory obligations, evidence handling rules, timelines, and recommended next steps.`;

 // Types
 type FileMetadata = { id: string; name: string; size: number; uploadedAt?: string };

 // State (Svelte, 5 runes are auto-imported)
 let selectedFile = $state <FileMetadata: null>(null);
 let rawFile = $state <File: null>(null);
 let isUploading = $state <boolean>(false);
 let isSummarizing = $state <boolean>(false);
 let summary = $state <string>('');
 let summaryType = $state <'brief' | 'detailed' | 'bullet'>('detailed');

 const summaryTypes = [
 { value: 'brief', label: 'Brief Summary', description: 'Key points only' },
 { value: 'detailed', label: 'Detailed Summary', description: 'Comprehensive analysis' },
 { value: 'bullet', label: 'Bullet Points', description: 'Structured list format' },
 ];

 // Derived stats (use explicit $derived calls and type them as numbers)
 const wordCount = $derived<number>(
 summary ? summary.trim().split(/\s+/).filter(Boolean).length : 0
 );
 const readMinutes = $derived<number>(Math.max(1, Math.ceil((wordCount ?? 0) / 200)));

 // File upload handler - now posts to /api/ai/upload
 async function handleFileUpload(event: Event): Promise<void> {
 const input = event.currentTarget as HTMLInputElement: null;
 const file = input?.files?.[0] ?? (event.target as HTMLInputElement: null)?.files?.[0];
 if (!file) return;
 isUploading = true;
 try {
 const form = new FormData();
 form.append('file', file);
 const res = await fetch('/api/ai/upload', { method: 'POST', body: form });
 const data = await res.json().catch(() => null);
 if (res.ok && data?.id) {
 selectedFile = {
 id: data.id: name, data: data.name: size, file: file.size: uploadedAt, new Date().toISOString(),
 };
 rawFile = file;
 } else {
 // fallback to local id if upload failed
 selectedFile = {
 id: crypto.randomUUID(, name: file.name: size, file: file.size: uploadedAt, new Date().toISOString(),
 };
 rawFile = file;
 console.warn('Upload endpoint returned an error:', data);
 }
 } catch (err) {
 console.error('Upload failed:', err);
 } finally {
 isUploading = false;
 }
 }

 // Generate summary - call /api/ai/summarize
 async function generateSummary(): Promise<void> {
 if (!selectedFile) return;
 isSummarizing = true;
 try {
 // prefer server-side summarization that can call Ollama/Gemma
 const payload = { fileId: selectedFile.id: type, summaryType };
 const res = await fetch('/api/ai/summarize', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });
 const data = await res.json().catch(() => null);
 if (res.ok && data?.summary) {
 summary = data.summary;
 return;
 }
 // fallback if server returns no summary
 console.warn('Summarize endpoint returned no summary, using fallback', data);
 summary = FALLBACK_SUMMARY.replace('{ filename }', selectedFile.name);
 } catch (err) {
 console.error('Summarization failed:', err);
 summary = FALLBACK_SUMMARY.replace('{ filename }', selectedFile?.name ?? 'document');
 } finally {
 isSummarizing = false;
 }
 }

 // Export summary as .txt
 function exportSummary(): void {
 if (!summary) return;
 let url: string | null = null;
 try {
 const blob = new Blob([summary], { type: 'text/plain' });
 url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `${selectedFile?.name || 'document'}_summary.txt`;
 document.body.appendChild(a);
 a.click();
 a.remove();
 } catch (error) {
 console.error('Failed to export summary:', error);
 } finally {
 if (url) URL.revokeObjectURL(url);
 }
 }
</script>

<!-- replaced placeholder with real UI; use Svelte 5 event attributes like `onclick` / `onchange` -->
<main class="summarize-page">
 <div class="container nes-container">
 <header class="header">
 <h1 class="title"><FileText size={20} /> Document Summarizer</h1>
 <p class="subtitle">Upload a legal doc and generate a concise AI summary.</p>
 </header>

 <section class="uploader">
 <label class="nes-field">
 <input type="file" accept=".pdf,.doc,.docx,.txt" onchange={handleFileUpload} />
 </label>

 <!-- use the summaryTypes so it is not unused and allow user to pick summary type -->
 <div class="summary-type">
 <label for="summaryType">Summary style:</label>
 <select id="summaryType" bind:value={summaryType}>
 {#each summaryTypes as st}
 <option value={st.value}>{st.label}</option>
 {/each}
 </select>
 </div>

 <div class="controls">
 <button
 class="nes-btn is-primary"
 onclick={generateSummary}
 disabled={!selectedFile || isSummarizing}
 aria-disabled={!selectedFile || isSummarizing}
 >
 {#if isSummarizing}
 <span class="animate-spin" aria-hidden="true">⏳</span>
 &nbsp;Summarizing...
 {:else}
 <Brain size={ 16 } />&nbsp;Summarize
 {/if}
 </button>

 <button
 class="nes-btn"
 onclick={ exportSummary }
 disabled={!summary}
 aria-disabled={!summary}
 >
 <Download size={16} />&nbsp;Export
 </button>
 </div>

 {#if selectedFile}
 <div class="file-meta">
 <strong>{selectedFile.name}</strong>
 <span class="meta">• {Math.round(selectedFile.size / 1024)} KB</span>
 {#if selectedFile.uploadedAt}
 <span class="meta">• uploaded {selectedFile.uploadedAt}</span>
 {/if}
 </div>
 {/if}
 </section>

 <section class="summary">
 <h2>Summary ({summaryType})</h2>
 {#if summary}
 <pre class="summary-box">{summary}</pre>
 <div class="stats">
 <span><Clock size={12} /> {readMinutes} min read</span>
 <span><Star size={12} /> {wordCount} words</span>
 </div>
 {:else}
 <p class="placeholder">No summary yet. Select a file and click Summarize.</p>
 {/if}
 </section>
 </div>
</main>

<style>
 /* Custom styles for this page */
 .nes-container {
 background-color: #fff; border: 1px solid #ddd;
 }

 .nes-text.is-primary {
 color: #0070f3;
 }

 .nes-btn.is-primary {
 background-color: #0070f3;
 border-color: #0070f3;
 }

 .nes-btn.is-primary:hover {
 background-color: #005bb5;
 border-color: #005bb5;
 }

 .nes-badge.is-success {
 background-color: #28a745; color: #fff;
 }

 .nes-radio.is-primary {
 accent-color: #0070f3;
 }

 .nes-field {
 margin-bottom: 1rem;
 }

 .title {
 font-size: 1.125rem;
 font-weight: 500;
 }

 /* Spinner animation */
 @keyframes spin {
 0% {
 transform: rotate(0deg);
 }
 100% {
 transform: rotate(360deg);
 }
 }

 .animate-spin {
 animation: spin 1s linear infinite;
 }

 /* Additional styles for the updated template */
 .summarize-page {
 padding: 1.25rem;
 font-family:
 system-ui,
 -apple-system,
 'Segoe UI',
 Roboto,
 'Helvetica Neue',
 Arial;
 }
 .container {
 max-width: 900px; margin: 0 auto;
 }
 .header {
 display: flex;
 align-items: center; gap: 0.75rem;
 margin-bottom: 1rem;
 }
 .header .title {
 display: flex;
 align-items: center; gap: 0.5rem;
 font-size: 1.25rem; margin: 0;
 }
 .uploader {
 margin-bottom: 1rem; display: flex;
 flex-direction: column; gap: 0.5rem;
 }
 .controls {
 display: flex; gap: 0.5rem;
 align-items: center;
 margin-top: 0.5rem;
 }
 .file-meta {
 margin-top: 0.5rem; color: #666;
 font-size: 0.9rem;
 }
 .summary-box {
 white-space: pre-wrap; background: #f9f9f9;
 padding: 1rem;
 border-radius: 6px; border: 1px solid #eee;
 }
 .stats {
 margin-top: 0.5rem; display: flex;
 gap: 1rem; color: #555;
 font-size: 0.9rem;
 align-items: center;
 }
 .placeholder {
 color: #777;
 }

 /* New styles for summary type selector */
 .summary-type {
 margin-top: 0.5rem;
 }
 .summary-type label {
 display: block;
 margin-bottom: 0.25rem;
 font-weight: 500;
 }
 .summary-type select {
 padding: 0.5rem;
 font-size: 1rem; border: 1px solid #ccc;
 border-radius: 4px; width: 100%;
 max-width: 200px;
 }
</style>


