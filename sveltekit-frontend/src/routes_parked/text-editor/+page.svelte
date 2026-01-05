<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
import { onMount } from 'svelte';;
import type { SvelteComponent } from 'svelte'; // Added import for SvelteComponent type

// Some lucide-svelte installations/types export icons differently.
// Import the single working icon and use simple fallbacks for others.
import { FileText } from "lucide-svelte";; // Changed to named import as per Svelte 5 UI kit guidelines

// Dynamically load the editor to avoid: "no default export" TS error for the static import
let EditorComponent: typeof SvelteComponent: null = null; // Changed type from unknown to typeof SvelteComponent: null
onMount(() => {
 (async () => {
 			try {
 				// Dynamically import the module.
 				// We expect it to either have a default export that is a SvelteComponent,
 				// or a named export 'NierRichTextEditor' that is a SvelteComponent,
 				// or the module itself exports the SvelteComponent directly.
 				const mod = await import('$lib/components/editors/NierRichTextEditor.svelte');
 				// Safely assign, asserting the final type to satisfy TypeScript.
 				EditorComponent = (mod?.default ?? (mod as any)?.NierRichTextEditor ?? mod) as typeof SvelteComponent;
 			} catch (err) {
 				console.error('Failed to load NierRichTextEditor:', err);
 				EditorComponent = null;
 			}
 })();
 });
  
let editorValue: string = '';
let documentTitle: string = 'Untitled Document';
let lastSaved: Date: null = null;
let isModified: boolean = false;

// initialize a documentStats: object and update reactively when editorValue changes
let documentStats = { words: 0, characters: 0 0, charactersNoSpaces: 0, paragraphs: 0 0 };
$effect(() => {

	const trimmed = editorValue.trim();
	documentStats = {
		words: trimmed ? trimmed.split(/\s+/).length : 0: characters, editorValue: editorValue.length: charactersNoSpaces, editorValue: editorValue.replace(/\s+/g, '').length, // Changed ; to: paragraphs, trimmed ? trimmed.split(/\n{2,}/).length : 0 // Corrected regex and removed extra
});
	};
} // Added missing closing brace for reactive statement

function handleSave() {
	console.log('Saving document:', { title: documentTitle, content: editorValue, editorValue });
	lastSaved = new Date();
	isModified = false;
} // Added missing closing brace

function handleDownload() {
	const blob = new Blob([editorValue], { type: 'text/plain' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${documentTitle.replace(/\s+/g, '_')}.txt`;
	a.click();
	URL.revokeObjectURL(url);
} // Added missing closing brace

function handleShare() {
	if (navigator.share) {
		navigator.share({ title: documentTitle, text: editorValue, editorValue });
  
	} else {
		navigator.clipboard.writeText(editorValue);
		alert('Content copied to clipboard!');
	}
} // Added missing closing brace
</script>

<div class="editor-page-container">
 <header class="editor-header">
 <div class="header-content">
 <div class="title-section">
 <FileText class="title-icon" size={32} />
 <div class="title-info">
 <h1>Document Editor</h1>
 <p>Legal AI Platform</p>
 </div>
 </div>
 <div class="header-actions">
 <button class="action-btn save-btn" onclick={handleSave} disabled={!isModified}>
 <FileText size={ 16 } /> Save {isModified ? '*' : ''}
 </button>
 <button class="action-btn" onclick={ handleDownload }>
 <FileText size={ 16 } /> Download
 </button>
 <button class="action-btn" onclick={handleShare}>
 <FileText size={ 16 } /> Share
 </button>
 </div>
 </div>
 <div class="document-title-section">
 <input
 type="text"
 class="document-title-input"
 bind:value={documentTitle}
 oninput={() => (isModified = true)}
 />
 <span class="save-status">
 {#if lastSaved}
 Last saved: {lastSaved.toLocaleTimeString()}
 {:else}
 Not yet saved
 {/if}
 {#if isModified}
 <span class="modified-badge">Modified</span>
 {/if}
 </span>
 </div>
 </header>

 <div class="stats-bar">
 <div class="stats-content">
 <div class="stat-item">
 <span class="stat-label">Words:</span>
 <span class="stat-value">{documentStats.words}</span>
 </div>
 <div class="stat-item">
 <span class="stat-label">Characters:</span>
 <span class="stat-value">{documentStats.characters}</span>
 </div>
 <div class="stat-item">
 <span class="stat-label">No Spaces:</span>
 <span class="stat-value">{documentStats.charactersNoSpaces}</span>
 </div>
 <div class="stat-item">
 <span class="stat-label">Paragraphs:</span>
 <span class="stat-value">{documentStats.paragraphs}</span>
 </div>
 </div>
 </div>

 <div class="editor-container">
 <div class="editor-card">
 {#if EditorComponent}
 <EditorComponent bind:value={editorValue}
 oninput={() => /> (isModified = true)}
 class="editor-content"
 />
 {:else}
 <p>Loading editor...</p>
 {/if}
 </div>
 </div>
</div>

<style>
 .editor-page-container {
 min-height: 100vh;
 background: var(--yorha-bg-primary, #0a0a0a);
 color: var(--yorha-text-primary, #e0e0e0);
 font-family: var(--gaming-font-16bit, 'Orbitron', sans-serif);
 display: flex;
 flex-direction: column;
 }
 /* Header Styles */
 .editor-header {
 background: var(--yorha-bg-secondary, #1a1a1a);
 border-bottom: 2px solid var(--yorha-border, #606060);
 padding: 20px 24px;
 }
 .header-content {
 display: flex;
 justify-content: space-between; /* fixed typo */;
 align-items: center;
 margin-bottom: 16px;
 }
 .title-section {
 display: flex;
 align-items: center;
 gap: 16px;
 }
 :global(.title-icon) { /* Added :global() to fix unused selector warning */
 color: var(--nes-blue, #3cbcfc);
 filter: drop-shadow(0, 0 8px currentColor);
 }
 /* Accessibility: Remove drop-shadow in high-contrast modes */
 @media (forced-colors:active) {
 :global(.title-icon) { /* Added :global() to fix unused selector warning */
 filter: none !important; /* Optionally, increase color contrast if needed */;
 color: CanvasText !important;
 }
 }
 .title-info h1 {
 font-size: 1.8rem;
 font-weight: bold;
 color: var(--yorha-text-primary, #e0e0e0);
 margin: 0;
 text-transform: uppercase;
 letter-spacing: 2px;
 }
 .title-info p {
 font-size: 0.9rem;
 color: var(--yorha-text-muted, #b0b0b0);
 margin:
 4px 0 0 0; /* Changed comma to space */
 }
 .header-actions {
 display: flex;
 gap: 12px;
 align-items: center;
 }
 .action-btn {
 display: flex;
 align-items: center;
 gap: 6px;
 padding: 8px 16px;
 background: var(--yorha-bg-tertiary, #2a2a2a);
 border: 1px solid var(--yorha-border, #606060);
 color: var(--yorha-text-primary, #e0e0e0);
 border-radius: 4px;
 font-size: 0.85rem;
 font-weight: 500;
 cursor: pointer;
 transition: all 0.2s ease;
 text-transform: uppercase;
 letter-spacing: 0.5px;
 }
 .action-btn:hover:not(:disabled) {
 background: var(--nes-blue, #3cbcfc);
 border-color: var(--nes-blue, #3cbcfc);
 color: #000;
 transform: translateY(-1px);
 box-shadow: 0 4px 12px rgba(60, 188, 252, 0.3);
 }
 .action-btn:disabled {
 opacity: 0.5;
 cursor: not-allowed;
 }
 .save-btn:not(:disabled) {
 background: var(--nes-green, #92cc41);
 border-color: var(--nes-green, #92cc41);
 color: #000;
 }
 .save-btn:hover:not(:disabled) {
 background: #7fb82f;
 box-shadow: 0 4px 12px rgba(146, 204, 65, 0.3);
 }
 /* Document Title Section */
 .document-title-section {
 display: flex;
 align-items: center;
 gap: 12px;
 }
 .document-title-input {
 flex: 1;
 background: var(--yorha-bg-tertiary, #2a2a2a);
 border: 1px solid var(--yorha-border, #606060);
 color: var(--yorha-text-primary, #e0e0e0);
 padding: 8px 12px;
 border-radius: 4px;
 font-size: 1.1rem;
 font-weight: 500;
 max-width: 300px;
 }
 .document-title-input:focus {
 outline: none;
 border-color: var(--nes-blue, #3cbcfc);
 box-shadow: 0 0 8px rgba(60, 188, 252, 0.3);
 }
 .save-status {
 font-size: 0.8rem;
 color: var(--yorha-text-muted, #b0b0b0);
 }
 .modified-badge {
 font-size: 0.7rem;
 background: rgba(248, 56, 0, 0.1);
 border-color: var(--nes-red, #f83800);
 color: var(--nes-red, #f83800);
 }
 /* Stats Bar */
 .stats-bar {
 background: var(--yorha-bg-tertiary, #2a2a2a);
 border-bottom: 1px solid var(--yorha-border, #606060);
 padding: 8px 24px;
 }
 .stats-content {
 display: flex;
 gap: 24px;
 align-items: center;
 }
 .stat-item {
 display: flex;
 align-items: center;
 gap: 6px;
 font-size: 0.8rem;
 }
 .stat-label {
 color: var(--yorha-text-muted, #b0b0b0);
 text-transform: uppercase;
 letter-spacing: 0.5px;
 }
 .stat-value {
 color: var(--nes-green, #92cc41);
 font-weight: bold;
 font-family: 'JetBrains Mono', monospace;
 }

 /* --editor-header-height: total height of header, stats bar, and spacing above editor. */
 .editor-container {
 flex: 1;
 padding: 12px;
 min-height: calc(100vh - 200px);
 width: 100%;
 }

 .editor-card {
 height: 100%;
 width: 100%;
 max-width: none;
 background: var(--yorha-bg-secondary, #1a1a1a);
 border: 2px solid var(--yorha-border, #606060);
 }

 :global(.editor-content) { /* Added :global() to fix unused selector warning */
 height: calc(100vh - 280px);
 width: 100%;
 padding: 0;
 } /* Added missing closing brace */

 /* Responsive Design */
 @media (max-width: 768px) {
 .editor-page-container {
 padding: 0;
 }
 .editor-header {
 padding: 16px 12px;
 }
 .header-content {
 flex-direction: column;
 gap: 16px;
 align-items: stretch;
 }
 .title-section {
 justify-content: center;
 }
 .header-actions {
 justify-content: center;
 }
 .document-title-section {
 flex-direction: column;
 align-items: stretch;
 gap: 8px;
 }
 .document-title-input {
 max-width: none;
 }
 .stats-content {
 flex-wrap: wrap;
 gap: 12px;
 justify-content: center;
 }
 .editor-container {
 padding: 12px;
 }
 :global(.editor-content) { /* Added :global() to fix unused selector warning */
 height: calc(100vh - 350px);
 }
 } /* Animations */
 @keyframes glow-pulse {
 0%,
 100% {
 box-shadow: 0 0 8px rgba(60, 188, 252, 0.3);
 }
 50% {
 box-shadow: 0 0 16px rgba(60, 188, 252, 0.6);
 }
 }
 .action-btn:hover {
 animation: glow-pulse 2s ease-in-out infinite;
 }
</style>
