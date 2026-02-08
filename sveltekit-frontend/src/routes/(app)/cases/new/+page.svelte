<script lang="ts">
 import { goto } from '$app/navigation';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

 let title = $state('');
 let narrative = $state('');
 let who = $state('');
 let what = $state('');
 let when = $state('');
 let where = $state('');
 let why = $state('');
 let how = $state('');

 let loading = $state(false);
 let error = $state<string | null>(null);
 let uploadedFiles = $state<File[]>([]);

 async function handleSubmit() {
 if (!title.trim()) {
 error = 'Please provide a case title.';
 return;
 }
 if (!narrative.trim() && !what.trim()) {
 error = 'Please fill in at least the narrative or "What happened" fields.';
 return;
 }

 loading = true;
 error = null;

 try {
 // Upload evidence files first (if any)
 const uploadedEvidenceIds: string[] = [];
 for (const file of uploadedFiles) {
 const formData = new FormData();
 formData.append('file', file);
 formData.append('type', 'document'); // TODO: infer from file type

 const uploadRes = await fetch('/api/evidence/upload', {
 method: 'POST',
 body: formData
 });

 if (uploadRes.ok) {
 const uploadData = await uploadRes.json();
 uploadedEvidenceIds.push(uploadData.evidenceId);
 }
 }

 // Create case via intake endpoint
 const res = await fetch('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
 title,
 description: narrative + `\n\nWHO: ${who}\nWHAT: ${what}\nWHEN: ${when}\nWHERE: ${where}\nWHY: ${why}\nHOW: ${how}`,
 status: 'open',
 priority: 'medium'
 })
 });

 if (!res.ok) {
 const data = await res.json();
 throw new Error(data.error || 'Failed to create case');
 }

 const data = await res.json();
 console.log('Case created:', data);

 // Redirect to case overview
 if (data.success && data.data?.id) {
    await goto(`/cases/${data.data.id}/overview`);
 } else if (data.success && data.data?.case?.id) {
    await goto(`/cases/${data.data.case.id}/overview`);
 } else {
    // Fallback if structure is different
    await goto(`/`);
 }

 } catch (err) {
 error = err instanceof Error ? err.message : 'Unknown error';
 console.error('Intake error:', err);
 } finally {
 loading = false;
 }
 }

 function handleFileDrop(e: DragEvent) {
 e.preventDefault();
 const files = e.dataTransfer?.files;
 if (files) {
 uploadedFiles = [...uploadedFiles, ...Array.from(files)];
 }
 }

 function removeFile(index: number) {
 uploadedFiles = uploadedFiles.filter((_, i) => i !== index);
 }
</script>

<div class="intake-container">
 <header class="intake-header">
 <h1>New Case Intake</h1>
 <p>Describe what happened. We'll auto-structure it into a prosecutable case.</p>
 </header>

 <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="intake-form">
  <!-- Case Title -->
  <div class="form-section">
  <label for="title">
  <h2>Case Title</h2>
  <p>Provide a short, descriptive title for this case.</p>
  </label>
  <input
  id="title"
  name="title"
  type="text"
  bind:value={title}
  placeholder="State v. Doe - Armed Robbery at 7-Eleven"
  class="title-input"
  />
  </div>

  <!-- Main narrative -->
  <div class="form-section">
  <label for="narrative">
  <h2>What Happened?</h2>
  <p>Describe the incident in your own words. Include people, dates, locations, and key events.</p>
  </label>
  <textarea
  id="narrative"
  bind:value={narrative}
  placeholder="On March 15, 2024, Officer Smith responded to a robbery at 7-Eleven on Main St..."
  rows="8"
  class="narrative-box"
  ></textarea>

 <!-- File upload -->
 <div
 class="file-drop-zone"
 onclick={() => document.getElementById('file-upload-input')?.click()}
 ondrop={handleFileDrop}
 ondragover={(e) => e.preventDefault()}
 role="button"
 tabindex="0"
 onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? document.getElementById('file-upload-input')?.click() : null}
 >
 <p>📎 Drag evidence files here (PDFs, photos, audio, video)</p>
 <input
 id="file-upload-input"
 type="file"
 multiple
 onchange={(e) => {
 const files = (e.target as HTMLInputElement).files;
 if (files) {
 uploadedFiles = [...uploadedFiles, ...Array.from(files)];
 }
 }}
 class="file-input"
 />
 </div>

 {#if uploadedFiles.length > 0}
 <div class="uploaded-files">
 <h3>Uploaded Files ({uploadedFiles.length})</h3>
 <ul>
 {#each uploadedFiles as file, i}
 <li>
 {file.name}
 <button type="button" onclick={() => removeFile(i)}>✕</button>
 </li>
 {/each}
 </ul>
 </div>
 {/if}
 </div>

 <!-- Guided prompts -->
 <div class="form-section guided-prompts">
 <h2>Guided Questions</h2>
 <p>Answer these to help structure the case:</p>

 <div class="prompt-group">
 <label for="who">
 <strong>WHO</strong> — Who is involved?
 </label>
 <input
 id="who"
 type="text"
 bind:value={who}
 placeholder="Suspect: John Doe. Victim: Jane Smith. Witness, Officer Johnson."
 />
 </div>

 <div class="prompt-group">
 <label for="what">
 <strong>WHAT</strong> — What happened?
 </label>
 <input
 id="what"
 type="text"
 bind:value={what}
 placeholder="Armed robbery of convenience store"
 />
 </div>

 <div class="prompt-group">
 <label for="when">
 <strong>WHEN</strong> — When did it happen?
 </label>
 <input
 id="when"
 type="text"
 bind:value={when}
 placeholder="March 15, 2024, approximately 11, 30 PM"
 />
 </div>

 <div class="prompt-group">
 <label for="where">
 <strong>WHERE</strong> — Where did it happen?
 </label>
 <input
 id="where"
 type="text"
 bind:value={where}
 placeholder="7-Eleven, 456 Main St, Springfield"
 />
 </div>

 <div class="prompt-group">
 <label for="why">
 <strong>WHY</strong> — Why is this conduct criminal?
 </label>
 <input
 id="why"
 type="text"
 bind:value={why}
 placeholder="Suspect needed money for drug habit"
 />
 </div>

 <div class="prompt-group">
 <label for="how">
 <strong>HOW</strong> — How did the suspect act?
 </label>
 <input
 id="how"
 type="text"
 bind:value={how}
 placeholder="Displayed firearm, demanded cash, fled in vehicle"
 />
 </div>
 </div>

 <!-- Error message -->
 {#if error}
 <div class="error-message">
 <strong>❌ Error:</strong> {error}
 </div>
 {/if}

 <!-- Submit button -->
 <div class="form-actions">
 <button type="submit" disabled={loading} class="btn-submit">
 {#if loading}
 ⏳ Analyzing with AI...
 {:else}
 🚀 Create Case
 {/if}
 </button>
 <p class="help-text">
 This will use AI to extract charges, persons, and evidence. You can edit everything after.
 </p>
 </div>
 </form>
</div>

<style>
 .intake-container { background: var(--yorha-bg); color: var(--yorha-ink);
 font-family: var(--yorha-font);
	padding: 2rem;
 min-height: 100vh;
 }

 .intake-header {
 margin-bottom: 2rem;
 border-bottom: 3px solid var(--yorha-crimson);
 padding-bottom: 1rem;
 }

 .intake-header h1 {
 margin: 0;
 font-size: 2rem;
	color: var(--yorha-crimson);
 font-weight: bold;
 }

 .intake-header p {
 margin: 0.5rem 0 0 0;
 color: #666;
 font-size: 0.875rem;
 }

 .intake-form {
 max-width: 900px;
	margin: 0 auto;
 }

 .form-section { background: var(--yorha-paper); border: 2px solid var(--yorha-ink);
 border-radius: 4px;
	padding: 1.5rem;
 margin-bottom: 1.5rem;
 }

 .form-section h2 {
 margin: 0 0 0.5rem 0;
 font-size: 1.25rem;
	color: var(--yorha-ink);
 }

 .form-section p {
 margin: 0 0 1rem 0;
 color: #666;
 font-size: 0.875rem;
 }

 .narrative-box { width: 100%; padding: 1rem;
 border: 1px solid #ddd;
 border-radius: 3px;
 font-family: var(--yorha-font);
 font-size: 0.95rem;
 line-height: 1.6;
	resize: vertical;
 color: var(--yorha-ink);
 }

 .narrative-box:focus {
 outline: none;
 border-color: var(--yorha-crimson);
 box-shadow: 0 0 0 2px rgba(255, 0, 0, 0.1);
 }

 .title-input { width: 100%; padding: 0.75rem;
 border: 1px solid #ddd;
 border-radius: 3px;
 font-family: var(--yorha-font);
 font-size: 1rem;
	color: var(--yorha-ink);
 font-weight: 500;
 }

 .title-input:focus {
 outline: none;
 border-color: var(--yorha-crimson);
 box-shadow: 0 0 0 2px rgba(255, 0, 0, 0.1);
 }

 .file-drop-zone {
 margin-top: 1rem;
	padding: 2rem;
 border: 2px dashed #ccc;
 border-radius: 4px;
 text-align: center;
	background: #f9f9f9;
 cursor: pointer;
	transition: all 0.2s ease;
 }

 .file-drop-zone:hover {
 border-color: var(--yorha-crimson);
	background: #fff5f5;
 }

 .file-drop-zone p { margin: 0; color: #666;
 }

 .file-input {
 display: none;
 }

 .uploaded-files {
 margin-top: 1rem;
	padding: 1rem;
 background: #f0f0f0;
 border-radius: 3px;
 }

 .uploaded-files h3 {
 margin: 0 0 0.5rem 0;
 font-size: 0.95rem;
 }

 .uploaded-files ul {
 list-style: none;
	padding: 0;
 margin: 0;
 }

 .uploaded-files li {
 display: flex;
 justify-content: space-between;
 align-items: center;
	padding: 0.5rem;
 background: white;
 border-radius: 3px;
 margin-bottom: 0.5rem;
 font-size: 0.875rem;
 }

 .uploaded-files button { background: none; border: none;
 color: var(--yorha-crimson);
	cursor: pointer;
 font-weight: bold;
 }

 .guided-prompts {
 background: #f9f9f9;
 }

 .prompt-group {
 margin-bottom: 1rem;
 }

 .prompt-group label {
 display: block;
 margin-bottom: 0.5rem;
 font-size: 0.9rem;
	color: var(--yorha-ink);
 }

 .prompt-group strong {
 color: var(--yorha-crimson);
 }

 .prompt-group input { width: 100%; padding: 0.75rem;
 border: 1px solid #ddd;
 border-radius: 3px;
 font-family: var(--yorha-font);
 font-size: 0.9rem;
	color: var(--yorha-ink);
 }

 .prompt-group input:focus {
 outline: none;
 border-color: var(--yorha-crimson);
 box-shadow: 0 0 0 2px rgba(255, 0, 0, 0.1);
 }

 .error-message { background: #ffe6e6; border: 2px solid var(--yorha-crimson);
 border-radius: 4px;
	padding: 1rem;
 margin-bottom: 1rem;
	color: var(--yorha-ink);
 font-size: 0.9rem;
 }

 .form-actions {
 text-align: center;
 }

 .btn-submit {
 padding: 1rem 2rem;
 background: var(--yorha-crimson);
	color: white;
 border: none;
 border-radius: 3px;
 font-family: var(--yorha-font);
 font-size: 1rem;
 font-weight: bold;
	cursor: pointer;
 transition: all 0.2s ease;
 }

 .btn-submit:not(:disabled):hover {
 background: #d32f2f;
 box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
 }

 .btn-submit:disabled { opacity: 0.6; cursor:not-allowed;
 }

 .help-text {
 margin-top: 1rem;
 font-size: 0.8rem;
	color: #999;
 }
</style>
