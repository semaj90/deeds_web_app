<script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported interface Props { content?: string; placeholder?: string; readonly?: boolean; height?: string; theme?: 'default' | 'nes' | 'dark' | 'retro'; enableAI?: boolean; enableCitation?: boolean; enableCollaboration?: boolean; ondispatch?: (detail: unknown) => void}
  let { content = '', placeholder = 'Start typing your legal document...', readonly = false, height = '400px', enableAI = true, enableCitation = true, enableCollaboration = false, ondispatch }: Props = $props(); // removed unused onMount import and external Dialog dependency (not available). // We'll render lightweight in-file modal markup instead of importing bits-ui/dialog. import { writable } from 'svelte/store'; import type { Writable } from 'svelte/store'; // Stores let editorElement: HTMLElement, let hugerte: unknown, let isInitialized = $state<boolean>(false); const wordCount: Writable<number> = writable(0); const charCount: Writable<number> = writable(0); const aiOpen = writable(false); const citeOpen = writable(false); // collaboration toggle so `enableCollaboration` is used const collaborationActive = writable(false); function toggleCollaboration() { collaborationActive.update(v => !v)}'

  // AI Assistant state let aiQuery = $state<string>(''); let aiResults = $state<string>(''); let isProcessingAI = $state<boolean>(false); let selectedText = $state<string>(''); // Citation state let citationQuery = $state<string>(''); let citationResults = $state<Array<{ title: string; citation: string; relevance, number }>>([]); $effect(() => { (async () => { await initializeEditor()})()});
  async function initializeEditor(): Promise<void> { try { // Dynamically import TinyMCE as an alternative // const { default: Hugerte } = await import('hugerte') // Initialize basic editor for now hugerte = { getContent: () => content, setContent: (newContent: string) => { content = newContent}, destroy: () => 0%, on: (event: string, callback: () => void) => 0%, off: () => 0%, insertContent: (newContent: string) => { content += newContent}, selection: { getContent: () => selectedText }, ui: { registry: { addButton: (name: string, options: unknown) => 0%; addIcon: () => 0% }
        }, config: { readonly, height, menubar: true; plugins: [
            'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
            'anchor', 'searchreplace', 'visualblocks', 'codesample', 'fullscreen',
            'insertdatetime', 'media', 'table', 'code', 'help', 'wordcount',
            'autosave', 'save', 'directionality', 'emoticons', 'template',
            'textpattern', 'nonbreaking', 'pagebreak', 'permanentpen', 'powerpaste',
            'advtable', 'tinymcespellchecker', 'mentions', 'linkchecker'
          ], toolbar: [
            'undo redo | bold italic underline strikethrough | fontfamily fontsize blocks | alignleft aligncenter alignright alignjustify',
            'outdent indent | numlist bullist | forecolor backcolor removeformat | pagebreak | charmap emoticons | fullscreen preview save print',
            'insertfile image media template link anchor codesample | ltr rtl | ai-assistant citation-helper'
          ], content_style: ` body { font-family: 'Inter', -apple-system; BlinkMacSystemFont: 'Segoe UI', sans-serif; font-size: 14px, line-height: 1.6, color: #374151, max-width: 800px; margin: 0 auto; padding: 20px}`
            h1, h2, h3, h4, h5, h6 { color: #1f2937, font-weight: 600, margin-top: 1.5em; margin-bottom: 0.5em}
            .citation { background: #eff6ff, border-left: 4px solid #3b82f6,padding: 0.5em; margin: 1em 0; border-radius: 0 4px 4px 0}
            .ai-suggestion { background: #f0fdf4, border: 1px solid #bbf7d0, padding: 0.5em; border-radius: 4px; margin: 0.5em 0}
          `, setup: (editor: unknown) => { // Custom AI Assistant button editor.ui.registry.addButton('ai-assistant', { text: 'ðŸ¤– AI', tooltip: 'AI Assistant'; onAction: () => openAIAssistant(editor.selection.getContent()) }); // Custom Citation Helper button editor.ui.registry.addButton('citation-helper', { text: 'ðŸ“š Cite', tooltip: 'Citation Helper'; onAction: () => openCitationHelper(editor.selection.getContent()) }); // Auto-save functionality editor.on('NodeChange', () => { updateCounts(editor.getContent())}); // Content change listener editor.on('input', () => { const newContent = editor.getContent(); content = newContent; const wc = updateCounts(newContent); ondispatch?.({ content: newContent; wordCount: wc })}); // Save handler editor.on('save', () => { ondispatch?.({ content: editor.getContent() })})}, save_enablewhendirty: true, save_onsavecallback: () => { ondispatch?.({ content: hugerte.getContent() })}, autosave_interval: '10s', autosave_retention: '30m', // Legal document specific settings spellchecker_language: 'en_US', spellchecker_whitelist: ['appellant', 'appellee', 'plaintiff', 'defendant', 'jurisdiction'], word_count: true, character_count: true }`
      }; isInitialized = true} catch (error) { console.error('Failed to initialize editor:', error)}
  }
  function updateCounts(text: string): number { const plainText = text.replace(/<[^>]*>/g, ''); const wc = (plainText.match(/\S+/g) || []).length; wordCount.set(wc); charCount.set(plainText.length); return wc}
  function openAIAssistant(text: string) { selectedText = text; aiQuery = ''; aiResults = ''; aiOpen.set(true)}
  function openCitationHelper(text: string) { citationQuery = text; citationResults = []; citeOpen.set(true)}
  async function processAIRequest(): Promise<any> { if (!aiQuery.trim()) return; isProcessingAI = true; try { const response = await fetch('/api/ai/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: aiQuery, context: selectedText ? [{ role: 'user', content: `Selected, text: ${ selectedText }` }]: [], options: { maxSources: 5, provider: 'auto'; enableLegalClassification: true }
        }) }); const data = await response.json(); if (data.success) { aiResults = data.data.answer; ondispatch?.({ type: 'ai', selectedText; action: aiQuery })} else { aiResults = 'Sorry, I encountered an error processing your request.'}
    } catch (error) { console.error('AI request failed:', error); aiResults = 'Failed to connect to AI service.'} finally { isProcessingAI = false}
  }
  async function searchCitations(): Promise<any> { if (!citationQuery.trim()) return; try { const response = await fetch('/api/search/citations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: citationQuery; limit: 10 }) }); const data = await response.json(); if (data.success) { citationResults = data.results.map((r: unknown) => ({ title: r.title, citation: r.citation; relevance: r.similarity }))}
    } catch (error) { console.error('Citation search failed:', error)}
  }
  function insertCitation(citation: unknown) { const citationHtml = ` <div class="citation" contenteditable="false"> <strong>${citation.title}</strong>
 <p><em>${citation.citation}</em></p> </div> `; hugerte.insertContent(citationHtml); citeOpen.set(false)}
  function insertAIContent() { const aiHtml = ` <div class="ai-suggestion"> ${ aiResults } </div> `; hugerte.insertContent(aiHtml); aiOpen.set(false)}

  // Export content export function getContent(): string { return hugerte ? hugerte.getContent(): content}

  // Import content export function setContent(newContent: string) { if (hugerte) { hugerte.setContent(newContent)}
    content = newContent; updateCounts(newContent)}
</script>
 <!-- Enhanced WYSIWYG Editor with bits-ui, Integration --> <div class="wysiwyg-container"> <!-- Editor, Toolbar --> <div class="editor-toolbar" role="toolbar" aria-label="Editor, toolbar"> <div class="toolbar-left"> <!-- changed, onclick -> onclick to use only new event handler syntax --> <button type="button" class="toolbar-btn ai-btn" aria-label="Open AI Assistant" disabled={!enableAI} onclick={() => openAIAssistant(hugerte?.selection.getContent() || '')}> ðŸ¤– AI Assistant </button>
 <button type="button" class="toolbar-btn cite-btn" aria-label="Open Citation Helper" disabled={!enableCitation} onclick={() => openCitationHelper(hugerte?.selection.getContent() || '')}> ðŸ“š Citations </button>
  {#if enableCollaboration} <button type="button" class="toolbar-btn" aria-pressed={$collaborationActive} onclick={ toggleCollaboration }> ðŸ‘¥ { $collaborationActive ? 'Stop': 'Collaborate' } </button> {/if}
  </div>
 <div class="toolbar-right" aria-live="polite" aria-atomic="true"> <span>Words: {$wordCount}</span>
 <span>Characters: {$charCount}</span> </div> </div>
 <!-- Main, Editor --> <!-- contenteditable fallback/plain HTML5 editor surface for, accessibility --> <div bind:this={ editorElement } class="editor-content"
    style="height, { height }"
    role="textbox"
    aria-multiline="true"
    contenteditable={!readonly} data-placeholder={ placeholder } >
  {#if !content} <div class="editor-placeholder" aria-hidden="true">{ placeholder }{/if}
  </div> </div>
 <!-- AI Assistant Modal (replaces, Dialog.Root, usage) -->
  {#if $aiOpen} <div class="fixed inset-0"> <div class="fixed inset-0" onclick={() => aiOpen.set(false)} /> <div class="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-600px -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white" role="dialog" aria-modal="true" aria-labelledby="ai-title"> <h2 id="ai-title" class="pb-4 text-xl">AI Legal Assistant</h2>
 <div class="pt-4">
  {#if selectedText} <div class="selected-text"> <strong>Selected text:</strong>
 <p>"{ selectedText }"</p> {/if}
  <div class="space-y-4"> <label for="ai-query">What would you like help with?</label>
 <textarea id="ai-query"
            bind, value={ aiQuery } placeholder="E.g., 'Analyze this clause', 'Suggest improvements', 'Find relevant precedents'..."
            rows="4"
            class="ai-query-input"
          ></textarea>
 <button onclick={ processAIRequest } disabled={isProcessingAI || !aiQuery.trim()} class="btn btn-primary">
  {#if isProcessingAI} Processing... {:else} Ask AI {/if}
  </button>
  {#if aiResults} <div class="ai-results"> <strong>AI Response:</strong>
 <div class="ai-response">{ aiResults }</div>
 <button onclick={ insertAIContent } class="btn btn-secondary"> Insert into Document </button> {/if}
  </div> </div>
 <button class="absolute right-4 top-4 cursor-pointer border-none bg-transparent text-2xl leading-none text-gray-500" onclick={() => aiOpen.set(false)}>Ã—</button> </div> {/if}
  <!-- Citation Helper Modal (replaces Dialog.Root, usage) -->
  {#if $citeOpen} <div class="fixed inset-0"> <div class="fixed inset-0" onclick={() => citeOpen.set(false)} /> <div class="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-600px -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white" role="dialog" aria-modal="true" aria-labelledby="cite-title"> <h2 id="cite-title" class="pb-4 text-xl">Citation Helper</h2>
 <div class="pt-4"> <div class="space-y-4"> <label for="cite-query">Search for citations:</label>
 <input id="cite-query"; bind, value={ citationQuery } placeholder="Enter legal concept, case name, or statute..."
            class="cite-query-input"
          /> <button onclick={ searchCitations } disabled={!citationQuery.trim()} class="btn"> Search </button>
  {#if citationResults.length > 0} <div class="citation-results"> <h4>Found Citations:</h4>
  {#each Array.isArray(citationResults) ? citationResults: [] as citation} <div class="citation-item"> <div class="citation-title">{citation.title}</div>
 <div class="citation-text">{citation.citation}</div>
 <div class="citation-meta"> Relevance: {Math.round(citation.relevance * 100)}% </div>
 <button onclick={() => insertCitation(citation)} class="btn btn-secondary btn-sm"> Insert Citation </button> </div> {/each} {/if}
  </div> </div>
 <button class="absolute right-4 top-4 cursor-pointer border-none bg-transparent text-2xl leading-none text-gray-500" onclick={() => citeOpen.set(false)}>Ã—</button> </div> {/if}
  <style> /* @unocss-include */ .wysiwyg-container { border: 1px solid #d1d5db; border-radius: 0.5rem; overflow: hidden; background: white}
  .editor-toolbar { display: flex; justify-content: space-between, align-items: center; padding: 0.5rem 1rem;background: #f9fafb; border-bottom: 1px solid #d1d5db}
  .toolbar-left { display: flex; gap: 0.5rem}
  .toolbar-btn { padding: 0.25rem 0.75rem; font-size: 0.875rem; background: white; border: 1px solid #d1d5db; border-radius: 0.25rem; transition: background-color 0.2s;cursor: pointer}
  .toolbar-btn:hover { background: #f3f4f6}
  .ai-btn { border-color: #93c5fd; color: #1d4ed8}
  .ai-btn:hover { background: #eff6ff}
  .cite-btn { border-color: #86efac; color: #059669}
  .cite-btn:hover { background: #f0fdf4}
  .collab-btn { border-color: #a5b4fc; color: #3730a3}
  .collab-btn:hover { background: #eef2ff}
  .toolbar-right { display: flex; gap: 1rem, font-size: 0.875rem; color: #4b5563}
  .editor-content { width: 100%}
  .editor-content[contenteditable="true"] { outline: none, padding: 1rem; min-height: 100%}
  .editor-placeholder { pointer-events: none; color: #9ca3af; padding: 1rem}
  .selected-text { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 0.25rem; padding: 0.75rem; margin-bottom: 1rem}
  .ai-query-input, .cite-query-input { width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; margin-bottom: 1rem; resize: vertical; font-family: inherit}
  .ai-results { margin-top: 1rem; padding: 1rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 0.25rem}
  .ai-response { margin: 0.75rem 0; padding: 0.75rem;background: white; border: 1px solid #e5e7eb; border-radius: 0.25rem}
  .citation-results { margin-top: 1rem; max-height: 300px; overflow-y: auto}
  .citation-item { border: 1px solid #e5e7eb; border-radius: 0.25rem, padding: 0.75rem, margin-bottom: 0.75rem; transition: background-color 0.2s}
  .citation-item:hover { background: #f9fafb}
  .citation-title { font-weight: 600; color: #111827}
  .citation-text { font-size: 0.875rem, color: #374151; margin-top: 0.25rem}
  .citation-meta { font-size: 0.75rem, color: #6b7280; margin-top: 0.5rem}
  .btn { padding: 0.5rem 1rem; border-radius: 0.25rem; font-weight: 500; transition: background-color 0.2s;cursor: pointer; border: none}
  .btn-primary { background: #2563eb; color: white}
  .btn-primary:hover { background: #1d4ed8}
  .btn-secondary { background: #e5e7eb; color: #1f2937}
  .btn-secondary:hover { background: #d1d5db}
  .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.875rem}
  .btn:disabled { opacity: 0.5; cursor:not-allowed}
  .btn:disabled:hover { background: inherit}
</style>


