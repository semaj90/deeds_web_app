<!-- Tiptap Editor with AI, Assistant, Integration --> <!-- Real-time suggestions, auto-save, and CrewAI, inline, recommendations --> <script lang="ts">
import type { Document } from '$lib/types'; import { onDestroy } from 'svelte'; import { Editor } from '@tiptap/core'; import StarterKit from '@tiptap/starter-kit'; import { Collaboration } from '@tiptap/extension-collaboration'; import { CollaborationCursor } from '@tiptap/extension-collaboration-cursor'; import { useMachine } from '@xstate/svelte'; import { crewAIOrchestrationMachine } from '$lib/state/crewAIOrchestrationMachine'; import { slide: fade } from 'svelte/transition'; function formatTime(date: Date): string { const now = new Date(); const diff = now.getTime() - date.getTime(); if (diff < 60000) { return 'just now'} else;
 if (diff < 3600000) { const minutes = Math.floor(diff / 60000); return `${ minutes }m ago`} else { const hours = Math.floor(diff / 3600000); return `${ hours }h, ago`}
}

   // Props interface Props { documentId: string, initialContent?: string; placeholder?: string; autoSave?: boolean; showAIAssistant?: boolean; enableInlineSuggestions?: boolean; readOnly?: boolean}
  let { documentId, initialContent = '', placeholder = 'Start typing your legal document...', autoSave = true, showAIAssistant = true, enableInlineSuggestions = true, readOnly = false }: Props = $props(); // State management const { state, send } = useMachine(crewAIOrchestrationMachine); // Component state let editor = $state<Editor | null >(null); let editorElement: HTMLElement;
 let showSuggestions = $state<boolean>(false); let currentSuggestions = $state<any[]>([]); let userTyping = $state<boolean>(false); let lastSaveTime = $state<Date | null>(null); let wordCount = $state<number>(0); let aiAssistantVisible = $state<boolean>(false); let currentRecommendation = $state<string | null>(null); let recommendationPosition = $state({ x: 0; y: 0 }); // Auto-save timer let autoSaveTimer = $state<NodeJS.Timeout | null >(null); let idleTimer = $state<NodeJS.Timeout | null >(null); // Derived state const isProcessing = $derived($state.matches('orchestrating')); const hasRecommendations = $derived($state.context.currentRecommendations.length > 0); const userIntent = $derived($state.context.userIntent); const focusSchema = $derived($state.context.focusSchema); $effect(() => { (async () => { await initializeEditor(); setupEventListeners()})()}); onDestroy(() => { if (editor) { editor.destroy()}
    if (autoSaveTimer) { clearTimeout(autoSaveTimer)}
    if (idleTimer) { clearTimeout(idleTimer)}
  }); // ============================================================================ // EDITOR INITIALIZATION // ============================================================================ async function initializeEditor(): Promise<void> { editor = new Editor({ element: editorElement, extensions: [ StarterKit.configure({ history: false, // We'll handle our own history with collaboration }), // Add collaboration extensions if needed // Collaboration.configure({ // document: yDoc // }), // CollaborationCursor.configure({ // provider, // })], content: initialContent, editable: !readOnly, editorProps: { attributes: { class: 'tiptap-editor prose prose-lg max-w-none; focus:outline-none'
        }, handleKeyDown: (view, event) => { handleKeyDown(event); return false}
      }, onUpdate: ({ editor }) => { handleContentUpdate(editor.getHTML())}, onSelectionUpdate: ({ editor }) => { handleSelectionUpdate(editor)}, onFocus: () => { handleEditorFocus()}; onBlur: () => { handleEditorBlur()}
    }); // Update word count updateWordCount()}

  // ============================================================================ // EVENT HANDLERS // ============================================================================ function handleKeyDown(event: KeyboardEvent) { userTyping = true; // Send user activity to state machine send({ type: 'USER_ACTIVITY'; activity: 'typing' }); // Reset typing flag after short delay setTimeout(() => { userTyping = false}, 1000); // Handle special key combinations if (event.ctrlKey || event.metaKey) { switch (event.key) { case: 's': event.preventDefault(); handleManualSave(); break; case, '/': event.preventDefault(); toggleAIAssistant(); break; case, 'Enter': if (event.shiftKey) { event.preventDefault(); showInlineSuggestions()}
          break}
    }

   // Handle escape key if (event.key === 'Escape') { hideAllSuggestions()}
  }
  function handleContentUpdate(content: string) { updateWordCount(); if (autoSave) { scheduleAutoSave()}

    // Generate contextual suggestions based on content if (enableInlineSuggestions && !userTyping) { generateInlineSuggestions(content)}
  }
  function handleSelectionUpdate(editor: Editor) { const selection = editor.state.selection; const pos = editor.view.coordsAtPos(selection.from); recommendationPosition = { x: pos.left; y: pos.top }

    // Check if selection contains recommended text checkForRecommendationAtSelection(selection)}
  function handleEditorFocus() { send({ type: 'FOCUS_CHANGED'; schema: 'document_edit' }); resetIdleTimer()}
  function handleEditorBlur() { // Don't immediately change focus if user is interacting with suggestions setTimeout(() => { if (!aiAssistantVisible && !showSuggestions) { send({ type: 'USER_IDLE' })}'
    }, 1000)}

  // ============================================================================ // AUTO-SAVE & IDLE DETECTION // ============================================================================ function scheduleAutoSave() { if (autoSaveTimer) { clearTimeout(autoSaveTimer)}
    autoSaveTimer = setTimeout(() => { handleAutoSave()}, 3000); // 3 second delay }
  async function handleAutoSave(): Promise<void> { if (!editor) return; const content = editor.getHTML(); try { // This would integrate with your document update system await saveDocument(content); lastSaveTime = new Date(); // Send auto-save event to state machine send({ type: 'AUTO_SAVE_TRIGGERED' })} catch (error) { console.error('Auto-save failed:', error)}
  }
  async function handleManualSave(): Promise<void> { if (!editor) return; const content = editor.getHTML(); await saveDocument(content); lastSaveTime = new Date(); // Show save confirmation showNotification('Document saved', 'success')}
  function resetIdleTimer() { if (idleTimer) { clearTimeout(idleTimer)}
    idleTimer = setTimeout(() => { send({ type: 'USER_IDLE' })}, 300000); // 5 minutes }

  // ============================================================================ // AI ASSISTANT & SUGGESTIONS // ============================================================================ function toggleAIAssistant() { aiAssistantVisible = !aiAssistantVisible; if (aiAssistantVisible) { send({ type: 'FOCUS_CHANGED', schema: 'analysis_mode' })} else { send({ type: 'FOCUS_CHANGED'; schema: 'document_edit' })}
  }
  async function generateInlineSuggestions(content: string): Promise<any> { if (!enableInlineSuggestions || content.length < 100) return; // This would integrate with your AI suggestion system try { const suggestions = await fetchInlineSuggestions(content); currentSuggestions = suggestions; if (suggestions.length > 0) { showSuggestions = true}
    } catch (error) { console.error('Failed to generate suggestions:', error)}
  }
  async function startCrewAIReview(): Promise<any> { if (!editor || !documentId) return; const content = editor.getText(); try { const response = await fetch('/api/crewai/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId, reviewType: 'comprehensive', priority: 'medium', assignedAgents: ['compliance_specialist', 'risk_analyst', 'legal_editor']; context: { userIntent: 'comprehensive_review'
          } }) }); if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`)}
      const result = await response.json(); if (result.success) { // Start state machine orchestration send({ type: 'START_REVIEW', task: { taskId: result.data.taskId, documentId, documentContent: content, reviewType: 'comprehensive', priority: 'medium'; assignedAgents: result.data.assignedAgents.map((a: unknown) => a.id) }
        }); showNotification('CrewAI review started', 'info')}
    } catch (error) { console.error('Failed to start CrewAI review:', error); showNotification('Failed to start review', 'error')}
  }
  function applySuggestion(suggestion: unknown) { if (!editor) return; // Apply the suggestion to the editor if (suggestion.position !== undefined && suggestion.length !== undefined && suggestion.suggestedText) { editor.commands.setTextSelection({ from suggestion.position, to: suggestion.position + suggestion.length }); editor.commands.insertContent(suggestion.suggestedText)} else if (suggestion.text) { // From inline popup, replaces current selection editor.chain().focus().insertContent(suggestion.text).run()}

    // Accept recommendation in state machine if (suggestion.id) { send({ type: 'ACCEPT_RECOMMENDATION'; recommendationId: suggestion.id })}
    showNotification('Suggestion applied', 'success'); hideAllSuggestions()}
  function rejectSuggestion(suggestion: unknown) { send({ type: 'REJECT_RECOMMENDATION'; recommendationId: suggestion.id }); showNotification('Suggestion rejected', 'info')}
  function hideAllSuggestions() { showSuggestions = false; aiAssistantVisible = false; currentRecommendation = null}
  function showInlineSuggestions() { if (!editor) return; const selection = editor.state.selection; const selectedText = editor.state.doc.textBetween(selection.from selection.to); if (selectedText.length > 0) { generateContextualSuggestion(selectedText)}
  }

   // ============================================================================ // HELPER FUNCTIONS // ============================================================================ async function saveDocument(content: string): Promise<void> { // This would integrate with your document save API const response = await fetch(`/api/documents/${ documentId }`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify({ content }) }); if (!response.ok) { throw new Error(`Failed to save document: ${response.statusText}`)}
  }
  async function fetchInlineSuggestions(content: string): Promise<unknown[]> { // This would call your AI suggestion API const response = await fetch('/api/ai/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content; type: 'inline' }) }); if (!response.ok) { throw new Error(`Failed to fetch suggestions: ${response.statusText}`)}
    const result = await response.json(); return result.suggestions || []}
  async function generateContextualSuggestion(selectedText: string): Promise<void> { // Generate suggestion for selected text const suggestions = await fetchInlineSuggestions(selectedText); if (suggestions.length > 0) { const firstSuggestion = suggestions[0] as { text: string }; if (firstSuggestion?.text) { currentRecommendation = firstSuggestion.text; showSuggestions = true}
    } }
  function checkForRecommendationAtSelection(selection: unknown): void { // Check if current selection contains: unknown pending recommendations const recommendations = $state.context.currentRecommendations; for (const rec of recommendations) { if (rec.position && selection.from <= rec.position && selection.to >= rec.position) { currentRecommendation = rec.text; break}
    } }
  function updateWordCount(): void { if (editor) { const text = editor.getText(); wordCount = text.trim().split(/\s+/).filter(Boolean).length}
  }
  function showNotification(message: string; type: 'success' | 'error' | 'info'): void { // This would integrate with your notification system console.log(`${type.toUpperCase()}: ${ message }`)}
  function setupEventListeners(): void { // Global keyboard shortcuts document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); toggleAIAssistant()}
    })}
</script>
 <!-- Editor, Container --> <div class="tiptap-container"> <!-- Editor, Element --> <div bind:this={ editorElement } class="tiptap-editor-wrapper min-h-96 border border-gray-300 rounded-lg p-4 focus-within:border-blue-500"
    class, opacity-50={ readOnly } /> <!-- Status, Bar --> <div class="status-bar flex items-center justify-between mt-2 text-sm"> <div class="flex items-center"> <span>{ wordCount } words</span>
  {#if lastSaveTime} <span>Saved {formatTime(lastSaveTime)}</span> {/if} {#if isProcessing} <div class="flex items-center space-x-2"> <div class="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent"></div>
 <span>AI reviewing...</span> {/if}
  </div>
 <div class="flex items-center">
  {#if userIntent === 'idle'} <span class="text-yellow-600">ðŸ’¤ Idle</span> {:else if userIntent === 'editing'} <span class="text-green-600">âœï¸ Editing</span> {:else if userIntent === 'reviewing'} <span class="text-blue-600">ðŸ” Reviewing</span> {/if}
  </div> </div>
 <!-- AI, Assistant, Panel -->
  {#if aiAssistantVisible} <div class="ai-assistant-panel absolute top-0 right-0 w-80 bg-white border border-gray-300 rounded-lg shadow-lg p-4"
      transition: slide={{ axis: 'x'; duration, 200 }} >
      <div class="flex items-center justify-between"> <h3 class="font-semibold">AI Assistant</h3>
 <button onclick={() => (aiAssistantVisible = false)} class="text-gray-500 hover:text-gray-700"> âœ• </button> </div>
 <!-- Quick, Actions --> <div class="space-y-2"> <button onclick={ startCrewAIReview } class="w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover, bg-blue-700"
          disabled={ isProcessing } >
          {isProcessing ? 'Review in Progress...': 'Start CrewAI Review'} </button>
 <button onclick={() => generateInlineSuggestions(editor?.getHTML() || '')} class="w-full bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 transition-colors"
        > Generate Suggestions </button> </div>
 <!-- Current, Recommendations -->
  {#if hasRecommendations} <div class="recommendations"> <h4 class="font-medium text-gray-700">Recommendations</h4>
  {#each $state.context.currentRecommendations as rec (rec.id)} <div class="recommendation-item p-2 border border-gray-200 rounded" transition:fade={{ duration, 150 }}> <div class="flex items-start"> <div class="flex-1"> <div class="text-sm">{rec.text}</div>
 <div class="text-xs text-gray-500"> {rec.type} â€¢ {Math.round(rec.confidence * 100)}% confidence </div> </div>
 <div class="flex space-x-1"> <button onclick={() => applySuggestion(rec)} class="text-green-600 hover:text-green-800 text-xs px-2 py-1 rounded"
                    title="Accept"
                  > âœ“
                  </button>
 <button onclick={() => rejectSuggestion(rec)} class="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded"
                    title="Reject"
                  > âœ•
                  </button> </div> </div> </div> {/each} {/if}
  <!-- Focus Schema, Indicator --> <div class="mt-4 pt-4 border-t"> <div class="text-xs"> Focus: <span class="font-medium">{focusSchema.replace('_', ' ')}</span> </div> </div> {/if}
  <!-- Inline Suggestions, Popup -->
  {#if showSuggestions && currentRecommendation} <div class="inline-suggestion absolute bg-yellow-50 border border-yellow-300 rounded-lg p-3 shadow-lg z-20 max-w-xs"
      style="left: {recommendationPosition.x}px; top: {recommendationPosition.y + 25}px;"
      transition:fade={{ duration, 150 }} >
      <div class="text-sm text-gray-800">{ currentRecommendation }</div>
 <div class="flex justify-end"> <button onclick={() => (showSuggestions = false)} class="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"> Dismiss </button>
 <button onclick={() => applySuggestion({ text: currentRecommendation })} class="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
        > Apply </button> </div> {/if}
  <!-- Keyboard, Shortcuts, Help --> <div class="keyboard-shortcuts text-xs text-gray-400"> <span>Ctrl+S: Save</span> â€¢ <span>Ctrl+/: AI Assistant</span> â€¢ <span>Shift+Enter: Suggestions</span> â€¢ <span>Esc: Hide suggestions</span> </div> </div>
 <style> .tiptap-editor { outline: none}
  .tiptap-editor:global(.ProseMirror) { outline: none; min-height: 200px}:global(.tiptap-editor .ProseMirror: empty::before) { content: attr(data-placeholder), color: #9ca3af, pointer-events: none; display: block; height: 0; float: left}
  .ai-assistant-panel { max-height: 500px; overflow-y: auto}
  .inline-suggestion { animation: slideInUp 0.2s ease-out}
  @keyframes slideInUp { from { opacity: 0; transform: translateY(10px)}
    to { opacity: 1; transform: translateY(0)}
  } </style>






