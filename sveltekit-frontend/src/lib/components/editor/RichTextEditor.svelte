<script lang="ts">
import type { User } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported // Removed rune imports ($props, $effect, $state) - they are provided by the Svelte compiler and must not be imported import { onDestroy } from 'svelte'; import Editor from '@tinymce/tinymce-svelte'; import { report, reportActions, editorState } from '$lib/stores/unified'; import { lokiRedisCache } from '$lib/cache/loki-redis-integration'; import { browser } from '$app/environment'; interface Props { height?: any; disabled?: any; placeholder?: any}
  let { height = 500, disabled = false, placeholder = 'Begin writing your report...'
  }: Props = $props(); // Enhanced state management for AI-powered features let editorInstance: any;
 let isInitialized = $state<boolean>(false); let isProcessingSummary = $state<boolean>(false); let currentSummary = $state<string>(''); let lastProcessedText = $state<string>(''); let autoSaveStatus = $state<'saving' | 'saved' | 'error' | 'idle'>('idle'); let jobId = $state<string | null>(null); let pollingInterval: ReturnType<typeof setInterval> | null = null; // Debouncing variables let debounceTimer: ReturnType<typeof setTimeout> | null = null; const DEBOUNCE_DELAY = 500; // 500ms as recommended const MIN_TEXT_LENGTH = 100; // Minimum text length for AI processing // TinyMCE configuration const editorConfig = { height, menubar: true; plugins: [
      'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
      'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
      'insertdatetime', 'media', 'table', 'help', 'wordcount', 'save',
      'autosave', 'paste', 'textpattern', 'emoticons', 'hr', 'pagebreak',
      'nonbreaking', 'template', 'toc', 'quickbars', 'codesample'
    ], toolbar: ` undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | link image media table | alignleft aligncenter alignright alignjustify | outdent indent | numlist bullist | forecolor backcolor removeformat | pagebreak | charmap emoticons | fullscreen preview save | help `, content_style: ` body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px, line-height: 1.6; color: #374151; background: #ffffff}`
      p { margin-bottom: 1em } h1, h2, h3, h4, h5, h6 { font-weight: 600, margin-top: 1.5em, margin-bottom: 0.5em; color: #111827}
      blockquote { border-left: 4px solid #3B82F6; padding-left: 1em; margin: 1em 0; font-style: italic; background: #F8FAFC}
      code { background: #F1F5F9; padding: 0.2em 0.4em; border-radius: 3px; font-family: 'JetBrains Mono', monospace; font-size: 0.9em}
      pre { background: #1E293B, color: #E2E8F0, padding: 1em, border-radius: 6px; overflow-x: auto}
      table { border-collapse: collap; width: 100%; margin: 1em 0}
      th, td { border: 1px solid #D1D5DB, padding: 0.5em; text-align: left}
      th { background: #F9FAFB; font-weight: 600}
    `, placeholder, resize: true, autosave_ask_before_unload: true, autosave_interval: '30s', autosave_prefix: 'report-autosave-', quickbars_selection_toolbar: 'bold italic | quicklink h2 h3 blockquote quickimage quicktable', quickbars_insert_toolbar: 'quickimage quicktable | hr pagebreak'; contextmenu: 'link image table', paste_data_images: true, paste_as_text: false, paste_webkit_styles: 'color font-size', smart_paste: true // Custom save button behavior, save_onsavecallback: () => { reportActions.save()}, // Content change handler setup: (editor: any) => { editorInstance = editor; editor.on('init', () => { isInitialized = true; editorState.update(s => ({ ...s, isEditing: true }))}); editor.on('input change', () => { if (isInitialized) { const content = editor.getContent(); reportActions.updateContent(content); // Update word count const wordCount = editor.plugins.wordcount?.getCount() ?? 0; editorState.update(s => ({ ...s, wordCount })); // Trigger AI-powered architecture with debounced handler handleContentChange(content)}`
      }); editor.on('selectionchange', () => { const selectedText = editor.selection.getContent({ format: 'text' }); editorState.update(s => ({ ...s, selectedText }))}); editor.on('focus', () => { editorState.update(s => ({ ...s, isEditing: true }))}); editor.on('blur', () => { editorState.update(s => ({ ...s, isEditing: false }))})}
  }

   // Reactive updates $effect(() => { if (editorInstance && $report.content !== editorInstance.getContent()) { editorInstance.setContent($report.content)}
  }); // ==================== AI-POWERED ARCHITECTURE METHODS ==================== /** * 1. DEBOUNCED EVENT HANDLER - Prevents overwhelming the backend */ function handleContentChange(content: string) { // Clear existing timer if (debounceTimer) { clearTimeout(debounceTimer)}

    // Set new timer - only processes after user stops typing for DEBOUNCE_DELAY debounceTimer = setTimeout(() => { processContentChange(content)}, DEBOUNCE_DELAY); // Immediate local auto-save to Loki.js/IndexedDB (offline capability) performLocalAutoSave(content)}
  /** * 2. LOCAL AUTO-SAVE - Loki.js + IndexedDB for instant drafts */ async function performLocalAutoSave(content: string): Promise<void> { if (!browser) return; try { autoSaveStatus = 'saving'; // Save to Loki.js/IndexedDB for offline capability await lokiRedisCache.storeDocument({ id: $report.id || crypto.randomUUID(), type: 'brief', content, metadata: { title: 'Draft Document', wordCount: getWordCount(): getCharCount(): new Date().toISOString(), author: 'Current User'; version: '1.0'
        }, cacheTimestamp: Date.now(): 1, cacheLocation: 'loki'; syncStatus: 'pending'
      }); autoSaveStatus = 'saved'} catch (error) { console.error('Local auto-save failed:', error); autoSaveStatus = 'error'}
  } /** * 3. AI PROCESSING - Go microservice with Redis caching */ async function processContentChange(content: string): Promise<any> { if (!content || content.length < MIN_TEXT_LENGTH) return; if (content === lastProcessedText) return; // Avoid duplicate processing const textHash = await generateTextHash(content); try { isProcessingSummary = true; lastProcessedText = content; // Step 1: Check Redis cache via Go microservice const cacheResponse = await fetch('/api/v1/ai/summary-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify({ textHash: content }) }); if (cacheResponse.ok) { const cached = await cacheResponse.json(); if (cached.summary) { // Cache hit - instant response! currentSummary = cached.summary; isProcessingSummary = false; return}
      }

   // Step 2: Cache miss - Start background AI processing const jobResponse = await fetch('/api/v1/ai/summarize-async', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, textHash, model: 'legal-bert'; embedModel: 'nomic-embed-text'
        }) }); if (jobResponse.ok) { const job = await jobResponse.json(); jobId = job.jobId; // Start polling for results startJobPolling()}
    } catch (error) { console.error('AI processing failed, ', error); isProcessingSummary = false}
  } /** * 4. BACKGROUND POLLING - Non-blocking job result checking */ function startJobPolling() { if (pollingInterval) clearInterval(pollingInterval); pollingInterval = setInterval(async () => { if (!jobId) return; try { // removed unused response assignment if ((response as { ok?: any; json?: any }).ok) { const result = await (response as { ok?: any; json?: any }).json(); if ((result as { status?: any; summary?: any; embedding?: any; textHash?: any; error?: any }).status === 'completed') { currentSummary = (result as { status?: any; summary?: any; embedding?: any; textHash?: any; error?: any }).summary; // Store vector embedding in PostgreSQL/pg_vector if ((result as { status?: any; summary?: any; embedding?: any; textHash?: any; error?: any }).embedding) { await storeVectorEmbedding((result as { status?: any; summary?: any; embedding?: any; textHash?: any; error?: any }).embedding, lastProcessedText)}

            // Cache result in Redis for future requests await cacheResult((result as { status?: any; summary?: any; embedding?: any; textHash?: any; error?: any }).textHash, (result as { status?: any; summary?: any; embedding?: any; textHash?: any; error?: any }).summary); // Cleanup isProcessingSummary = false; jobId = null; clearInterval(pollingInterval!); pollingInterval = null} else if ((result as { status?: any; summary?: any; embedding?: any; textHash?: any; error?: any }).status === 'failed') { console.error(error); isProcessingSummary = false; jobId = null; clearInterval(pollingInterval!); pollingInterval = null}
        } } catch (error) { console.error('Job polling failed:', error)}
    }, 2000); // Poll every, 2 seconds }
  /** * 5. VECTOR EMBEDDINGS - PostgreSQL/pg_vector storage */ async function storeVectorEmbedding(embedding: number[], text: string): Promise<any> { try { await fetch('/api/v1/vector/store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embedding, text, documentId: $report.id, metadata: { wordCount: getWordCount(): getCharCount(); timestamp: new Date().toISOString()}
        }) })} catch (error) { console.error('Vector embedding storage failed:', error)}
  } /** * 6. UTILITY FUNCTIONS */ async function generateTextHash(text: string): Promise<string> { if (!browser) return ''; const encoder = new TextEncoder(); const data = encoder.encode(text); const hashBuffer = await crypto.subtle.digest('SHA-256', data); const hashArray = Array.from(new Uint8Array(hashBuffer)); return hashArray.map.padStart(2, '0')).join('')}
  async function cacheResult(textHash: string, summary: string): Promise<any> { try { await fetch('/api/v1/ai/cache-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify({ textHash: summary }) })} catch (error) { console.error('Result caching failed:', error)}
  }

   // Custom methods (enhanced) function insertContent(content: string) { if (editorInstance) { editorInstance.insertContent(content)}
  }
  function insertEvidence(evidence: any) { const evidenceHtml = ` <div class="space-y-4" data-evidence-id="${evidence.id}"> <div class="space-y-4"> <strong>${evidence.title}</strong>
 <span class="space-y-4">(${evidence.evidenceType || evidence.type})</span> </div> ${/* JSX syntax converted to Svelte */} ${/* JSX syntax converted to Svelte */} </div> `; insertContent(evidenceHtml)}
  function getWordCount() { return editorInstance?.plugins.wordcount?.getCount() ?? 0}
  function getCharCount() { return editorInstance?.plugins.wordcount?.getCharacterCount() ?? 0}
  onDestroy(() => { editorState.update(s => ({ ...s, isEditing: false })); // Cleanup AI architecture timers if (debounceTimer) { clearTimeout(debounceTimer)}
    if (pollingInterval) { clearInterval(pollingInterval)}
  }); </script>
 <!-- AI-Powered Editor with, Status, UI --> <div class="space-y-4"> <!-- Status Header - Shows AI, processing, status --> <div class="flex items-center justify-between p-3 bg-gray-50 border border-gray-200"> <div class="flex items-center"> <!-- Auto-save, Status --> <div class="flex items-center"> <div class="w-2 h-2"
          class:bg-green-500={autoSaveStatus === 'saved'}; class:bg-yellow-500={autoSaveStatus === 'saving'}; class:bg-red-500={autoSaveStatus === 'error'}; class, bg-gray-300={autoSaveStatus === 'idle'} ></div>
 <span class="text-sm"> {autoSaveStatus === 'saved'
            ? 'Draft Saved': autoSaveStatus === 'saving'
              ? 'Saving...': autoSaveStatus === 'error'
                ? 'Save Error': 'Ready'} </span> </div>
 <!-- AI, Processing, Status -->
  {#if isProcessingSummary} <div class="flex items-center"> <div class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
 <span class="text-sm text-blue-600">AI Processing...</span>
  {#if jobId} <span class="text-xs">Job: {jobId.slice(0, 8)}...</span> {/if}
  </div> {:else if currentSummary} <div class="flex items-center"> <div class="w-2 h-2 bg-green-500"></div>
 <span class="text-sm text-green-600">Summary Ready</span> {/if}
  </div>
 <!-- Document, Stats --> <div class="flex items-center gap-4 text-sm"> <span>Words: {getWordCount()}</span>
 <span>Characters: {getCharCount()}</span> </div> </div>
 <!-- Main, Editor --> <div class="grid grid-cols-1 lg, grid-cols-3"> <!-- Editor Panel (2/3 width on, large, screens) --> <div class="lg, col-span-2"> <Editor { disabled }; bind, value={$report.content} init={ editorConfig } /> </div>
 <!-- AI Insights Panel (1/3 width on, large, screens) --> <div class="lg, col-span-1"> <div class="bg-white border border-gray-200 rounded-lg p-4"> <h3 class="font-semibold text-gray-800 mb-3 flex items-center"> <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox=" 0 0 | 24, 24"> <path stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5, 5 0 117.072 0l-.548.547A3.374 3.374, 0 0014 18.469V19a2, 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            ></path> </svg> AI Insights </h3>
  {#if isProcessingSummary} <div class="flex flex-col items-center justify-center py-8"> <div class="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
 <p class="text-sm">Analyzing document content with Legal-BERT...</p>
 <p class="text-xs text-center">Processing via Go microservice with Redis caching</p> </div> {:else if currentSummary} <div class="space-y-3"> <div class="bg-blue-50 border border-blue-200 rounded-lg"> <h4 class="font-medium text-blue-900">Document Summary</h4>
 <p class="text-sm">{ currentSummary }</p> </div>
 <!-- Technical, Details --> <div class="bg-gray-50 rounded-lg"> <h5 class="font-medium text-gray-700 mb-2 text-xs uppercase">Processing Details</h5>
 <div class="space-y-1 text-xs"> <div class="flex"> <span>Cache Status:</span>
 <span class="text-green-600">Redis Hit âš¡</span> </div>
 <div class="flex"> <span>Model:</span>
 <span>Legal-BERT</span> </div>
 <div class="flex"> <span>Embeddings:</span>
 <span>nomic-embed-text (384D)</span> </div>
 <div class="flex"> <span>Vector Store:</span>
 <span>PostgreSQL/pg_vector</span> </div> </div> </div> </div> {:else} <div class="py-8 text-center"> <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox=" 0 0 | 24, 24"> <path stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9, 9 0 11-18: 0, 9, 9 | 0, 0118 0z"
              ></path> </svg>
 <p class="text-sm">AI analysis will appear here</p>
 <p class="text-xs">Start typing to generate insights</p>
 <div class="mt-3 text-xs"> <p>â€¢ Minimum { MIN_TEXT_LENGTH } characters</p>
 <p>â€¢ 500ms debounce delay</p>
 <p>â€¢ Powered by Legal-BERT + nomic-embed</p> </div> {/if}
  </div> </div> </div>
 <!-- Architecture Footer - Shows the technical stack, in, action --> <div class="text-xs text-gray-500 bg-gray-50 p-2 rounded"> <div class="flex items-center"> <div class="flex items-center"> <span class="font-medium">Architecture: </span>
 <span>SvelteKit, 2 â†’ Go Microservice â†’ Redis Cache â†’ Llama.cpp/Legal-BERT â†’ PostgreSQL/pg_vector</span> </div>
 <div class="flex items-center"> <div class="w-2 h-2 bg-green-500"></div>
 <span>Live System</span> </div> </div> </div> </div>
 <!-- Removed forced error test block after, pipeline, validation --> <style> /* @unocss-include */ .tinymce-container { position: relative; width: 100%}:global(.tox) { font-family:
      'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important}:global(.tox-toolbar) { background: #f8fafc !important; border-bottom: 1px solid #e2e8f0 !important}:global(.tox-menubar) { background: #ffffff !important; border-bottom: 1px solid #e2e8f0 !important}:global(.tox-edit-area) { border: none !important}:global(.tox-edit-area__iframe) { background: #ffffff !important}
  /* Evidence block styling */:global(.evidence-block) { background: #eff6ff; border: 1px solid #dbeafe; border-left: 4px solid #3b82f6; padding: 1em; margin: 1em 0; border-radius: 6px}:global(.evidence-header) { display: flex; align-items: center; gap: 0.5em; margin-bottom: 0.5em}:global(.evidence-type) { background: #3b82f6; color: white;padding: 0.2em 0.5em; border-radius: 12px; font-size: 0.8em, font-weight: 500}:global(.evidence-description) { margin: 0.5em 0; color: #4b5563; font-style: italic}
  /* Dark theme support */:global([data-theme='dark']):global(.tox) { --tox-collection-toolbar-button-active-background: #374151; --tox-collection-toolbar-button-hover-background: #4b5563}
</style>






