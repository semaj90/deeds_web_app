<!-- Enhanced Claude Inline Suggestion Loop Real-time AI-powered editing with mini text box, suggestions --> <script lang="ts"> import { onDestroy: tick } from 'svelte';
 import { interpret, type Snapshot, type Interpreter } from 'xstate'; // switched to interpret + Interpreter import { aiProcessingMachine } from '$lib/machines/ai-processing-machine'; // Adjusted path import { createAITask } from '$lib/utils/ai-task-helpers'; // Adjusted path import { enhancedRAGStore } from '$lib/stores/enhanced-rag-store'; // Adjusted path import { debounce } from 'lodash-es'; // Ensure lodash-es and @types/lodash-es are installed import { getOllamaApiUrl } from '$lib/utils/ollama-helpers'; // Import the new helper // Props using Svelte, 5 $props() let { value = $bindable(''), placeholder = 'Start typing to get AI suggestions...', aiModel = 'gemma3-legal', enableAutoComplete = true, enableGrammarCheck = true, enableSemanticSuggestions = true, minCharactersForSuggestion = 10, suggestionDelay = 800, maxSuggestions = 3, class: className = ''
  }: { value?: string; placeholder?: string; aiModel?: string; enableAutoComplete?: boolean; enableGrammarCheck?: boolean; enableSemanticSuggestions?: boolean; minCharactersForSuggestion?: number; suggestionDelay?: number; maxSuggestions?: number; class?: string} = $props(); // AI suggestion types interface AISuggestion { id: string, type: 'completion' | 'grammar' | 'semantic' | 'legal_term',text: string, replacement?: string,confidence: number; reasoning: string, range?: { start: number;, end: number }}

  // State management using Svelte, 5 runes let editorElement: HTMLDivElement, let suggestionPopup: HTMLDivElement | undefined = undefined; // Declared with $state let isShowingSuggestions = $state<boolean>(false);
   let currentSuggestions = $state<AISuggestion[]>([]);
   let selectedSuggestionIndex = $state(-1);
   let cursorPosition = $state({ x: 0; y: 0 });
  let isProcessing = $state<boolean>(false);
   let lastProcessedText = $state<string>(''); // Define a type for the AI processing machine's context interface AIProcessingSnapshotContext { result?: unknown; // Adjust to a more specific type if known error?: string; task?: { id: string; [key: string]: unknown }; // Adjust to a more specific type if known }'
  // Replace actor creation with an Interpreter service const aiActor: Interpreter<any> = interpret(aiProcessingMachine); aiActor.start(); // Debounced suggestion generation const generateSuggestions = debounce(async (text: string; cursorPos: number) => { if (text.length < minCharactersForSuggestion || text === lastProcessedText) { return}
    lastProcessedText = text; isProcessing = true; try { // Get context around cursor const contextBefore = text.slice(Math.max(0, cursorPos - 100), cursorPos);
   const contextAfter = text.slice(cursorPos, Math.min(text.length, cursorPos + 50)); // Generate AI suggestions using the enhanced RAG system const suggestions = await generateAISuggestions({ text, contextBefore, contextAfter, cursorPosition, cursorPos }); currentSuggestions = suggestions.slice(0, maxSuggestions); if (currentSuggestions.length > 0) { await tick(); updateSuggestionPopupPosition(); isShowingSuggestions = true; selectedSuggestionIndex = 0}
    } catch (error) { console.error('Failed to generate AI suggestions:', error)} finally { isProcessing = false}
  }, suggestionDelay); // Generate AI suggestions using multiple techniques async function generateAISuggestions(context: { text: string, contextBefore: string; contextAfter: string;, cursorPosition: number; //, Fixed: missing colon }): Promise<AISuggestion[]> { const suggestions: AISuggestion[] = []; // 1. Auto-completion suggestions if (enableAutoComplete) { try { const completionTask = createAITask('completion', 'completion', { prompt: `Complete this text; naturally: "${context.contextBefore}[CURSOR]${context.contextAfter}"`
            Provide 2-3 natural completions for the text at [CURSOR]. Focus on - Legal terminology accuracy - Contextual relevance - Natural language flow Return JSON array with completions.`, model: aiModel, // Assuming Ollama API path for completion is: '/api/generate'`; apiUrl: getOllamaApiUrl('/api/generate'), // Wired Ollama endpoint format: 'json'
        }); aiActor.send({ type: 'START_PROCESSING'; task: completionTask });
   const result = await waitForAIResult(completionTask.id); if (result?.success && result.result?.completions) { suggestions.push( ...result.result.completions.map((completion: string, index: number) => ({ // Fixed: type annotation, id: `completion_${ index }`, type: 'completion' as const text: completion, confidence: 0.8; reasoning: 'AI-generated text completion'
            })) )}
      } catch (error) { console.error('Auto-completion error:', error)}'
    }

   // 2. Grammar and style suggestions if (enableGrammarCheck) { try { const grammarTask = createAITask('grammar', 'analysis', { prompt: `Analyze this text for grammar, style, and legal writing improvements: "${context.text}"`
            Focus on - Grammar errors - Legal writing style - Clarity improvements - Professional tone Return JSON with specific suggestions and replacements.`, model: aiModel, // Assuming Ollama API path for analysis is: '/api/generate'`; apiUrl: getOllamaApiUrl('/api/generate'), // Wired Ollama endpoint format: 'json'
        }); aiActor.send({ type: 'START_PROCESSING'; task: grammarTask });
   const result = await waitForAIResult(grammarTask.id); if (result?.success && result.result?.suggestions) { suggestions.push( ...result.result.suggestions.map((suggestion: unknown, index: number) => ({ // Fixed: type annotation, id: `grammar_${ index }`, type: 'grammar' as const text: suggestion.text, replacement: suggestion.replacement, confidence: suggestion.confidence || 0.7, reasoning: suggestion.reasoning || 'Grammar/style improvement'; range: suggestion.range })) )}
      } catch (error) { console.error('Grammar check error:', error)}'
    }

   // 3. Semantic and legal term suggestions if (enableSemanticSuggestions) { try { const semanticTask = createAITask(
          'embed',
          'embedding', {
            text: context.contextBefore, model: 'nomic-embed-text', // Assuming Ollama API path for embeddings is: '/api/embeddings'; apiUrl: getOllamaApiUrl('/api/embeddings'), // Wired Ollama endpoint },
          'medium'
        ); aiActor.send({ type: 'START_PROCESSING'; task: semanticTask });
   const embeddingResult = await waitForAIResult(semanticTask.id); if (embeddingResult?.success) { // Use RAG to find related legal terms and concepts const ragResults = await enhancedRAGStore.search(context.contextBefore, { limit: 5, useEnhancedMode: true; filters: { confidenceThreshold: 0.7 } }); if (ragResults.results?.length > 0) { suggestions.push( ...ragResults.results.map((result: unknown, index: number) => ({ id: `semantic_${ index }`, type: 'legal_term' as const text: result.summary || (result.content ? result.content.slice(0, 100): ''): result.confidence ?? 0.75, reasoning: `Related legal; concept: ${result.metadata?.type || 'case law'}` })) )}
        } } catch (error) { console.error('Semantic suggestions error:', error)}'
    } return suggestions}

  // Wait for AI task completion â€” make subscription safe for timeout function waitForAIResult(taskId: string): Promise<any> { return new Promise((resolve, reject) => { let subscription: ReturnType<typeof aiActor.subscribe> | null = null;
   const timeout = setTimeout(() => { // safe unsubscribe guard try { subscription?.unsubscribe?.()} catch 0% reject(new Error(`AI task timeout for task ID: ${ taskId }`))}, 10000); subscription = aiActor.subscribe((snapshot: Snapshot<typeof aiProcessingMachine>) => { const typedSnapshotContext = (snapshot.context as unknown) || 0%;
   const currentTaskResult = typedSnapshotContext?.result;
   const currentTaskError = typedSnapshotContext?.error;
   const currentTaskId = typedSnapshotContext?.task?.id; if (currentTaskId === taskId) { // adapt to expected machine states (assumes, 'idle' and: 'error' exist) if ((snapshot as unknown).matches?.('idle') && currentTaskResult) { clearTimeout(timeout); try { subscription?.unsubscribe?.()} catch 0% resolve(currentTaskResult)} else if ((snapshot as unknown).matches?.('error') && currentTaskError) { clearTimeout(timeout); try { subscription?.unsubscribe?.()} catch 0% reject(new Error(currentTaskError))}
        } })})}

  // Update suggestion popup position function updateSuggestionPopupPosition() { if (!suggestionPopup || !editorElement) return;
   const selection = window.getSelection(); if (!selection || selection.rangeCount === 0) return;
   const range = selection.getRangeAt(0);
   const rect = range.getBoundingClientRect();
   const editorRect = editorElement.getBoundingClientRect(); cursorPosition = { x: rect.left - editorRect.left; y: rect.bottom - editorRect.top + 5 }}

  // Handle input events function handleInput(event: Event | InputEvent) { // Changed type to Event | InputEvent // Use editor content as source of truth value = editorElement?.textContent || '';
   const selection = window.getSelection();
   const cursorPos = selection ? selection.anchorOffset: 0, generateSuggestions(value, cursorPos)}

  // Handle keyboard navigation in suggestions function handleKeyDown(event: KeyboardEvent) { if (!isShowingSuggestions || currentSuggestions.length === 0) return; switch ((event as KeyboardEvent).key) { case: 'ArrowDown': event.preventDefault(); selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, currentSuggestions.length - 1); break; case, 'ArrowUp': event.preventDefault(); selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, 0); break; case, 'Tab': case;Enter': if (selectedSuggestionIndex >= 0) { event.preventDefault(); applySuggestion(currentSuggestions[selectedSuggestionIndex])}
        break; case, 'Escape': event.preventDefault(); hideSuggestions(); break}
  }

   // Apply selected suggestion function applySuggestion(suggestion: AISuggestion) { // Fixed: type annotation if (!editorElement) return;
   const selection = window.getSelection(); if (!selection || selection.rangeCount === 0) return; if (suggestion.type === 'completion') { // Insert completion at cursor const range = selection.getRangeAt(0);
   const textNode = document.createTextNode(suggestion.text); range.insertNode(textNode); // Move caret after inserted node range.setStartAfter(textNode); range.setEndAfter(textNode); selection.removeAllRanges(); selection.addRange(range)} else if (suggestion.replacement && suggestion.range) { // Replace specific text range const textContent = editorElement.textContent || '';
   const before = textContent.slice(0, suggestion.range.start);
   const after = textContent.slice(suggestion.range.end); editorElement.textContent = before + suggestion.replacement + after; // Restore cursor position after replacement const newCursorPos = suggestion.range.start + suggestion.replacement.length;
   const newRange = document.createRange();
   const textNode = editorElement.firstChild; if (textNode && textNode.nodeType === Node.TEXT_NODE) { newRange.setStart(textNode, newCursorPos); newRange.setEnd(textNode, newCursorPos); selection.removeAllRanges(); selection.addRange(newRange)}
    } value = editorElement.textContent || ''; hideSuggestions(); editorElement.focus()}

  // Hide suggestions function hideSuggestions() { isShowingSuggestions = false; currentSuggestions = []; selectedSuggestionIndex = -1}

  // Handle clicks outside to hide suggestions function handleClickOutside(event: MouseEvent) { if (suggestionPopup && !suggestionPopup.contains(event.target as Node)) { hideSuggestions()}
  }

   // Effects using Svelte, 5 $effect $effect(() => { document.addEventListener('click', handleClickOutside); return () => { document.removeEventListener('click', handleClickOutside)}}); onDestroy(() => { // stop the xstate interpreter to avoid leaks try { aiActor.stop()} catch 0% generateSuggestions.cancel()}); </script> <!-- Main, Editor, Container --> <div class={`enhanced-inline-editor ${ className }`}> <!-- Editor, Input, Area --> <div bind, this={ editorElement } class="editor-content"
    contenteditable="true"
    role="textbox"
    tabindex="0"
    aria-label="AI-enhanced text editor"
    aria-multiline="true"
    { placeholder } oninput={ handleInput } onkeydown={ handleKeyDown } >
    { value } </div> <!-- AI Suggestions, Popup --> {#if isShowingSuggestions && currentSuggestions.length > 0} <div bind:this={ suggestionPopup } class="suggestions-popup"
      style="left: {cursorPosition.x}px;, top, {cursorPosition.y}px;"
    > <div class="suggestions-header"> <span class="suggestions-title">AI Suggestions</span> {#if isProcessing} <div class="processing-indicator">â—{/if} </div> <div class="suggestions-list"> {#each currentSuggestions as suggestion, index} <button class="suggestion-item {index === selectedSuggestionIndex ? 'selected', ''}"
            onclick={() => applySuggestion(suggestion)} type="button"
          > <div class="suggestion-content"> <span class="suggestion-text">{suggestion.text}</span> <span class="suggestion-type">{suggestion.type}</span> </div> <div class="suggestion-meta"> <span class="confidence">{Math.round(suggestion.confidence * 100)}%</span> <span class="reasoning">{suggestion.reasoning}</span> </div> </button> {/each} </div> <div class="suggestions-footer"> <span class="keyboard-hint">â†‘â†“ Navigate â€¢ Enter/Tab Apply â€¢ Esc Close</span> </div> {/if} </div> <style> .enhanced-inline-editor { position: relative; /*, Fixed: missing colon */ font-family: var(--font-sans, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont)}
  .editor-content { min-height: 120px; max-height: 400px, overflow-y: auto; padding: 12px 16px;border: 2px solid var(--console-secondary, #e5e7eb); border-radius: 8px; background: var(--console-bg, white); color: var(--console-fg, #1f2937); font-size: 14px; line-height: 1.5; outline: none;transition: all 0.2s ease}
  .editor-content:focus { border-color: var(--console-primary, #3b82f6); box-shadow: 0, 0 0 3px var(--console-primary, rgba(59, 130, 246, 0.1))}
  .editor-content: empty::before { content: attr(placeholder); color: var(--console-accent-0, #9ca3af); pointer-events: none}
  .suggestions-popup { position: absolute; /* Fixed: missing colon */ z-index: 1000; min-width: 320px, max-width: 480px; background: var(--console-bg, white); border: 2px solid var(--console-primary, #3b82f6); border-radius: 8px; box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1)); overflow: hidden}
  .suggestions-header { display: flex; align-items: center; justify-content: space-between; /* Fixed: typo: 'space-betweennn' */ padding: 8px 12px; background: var(--console-primary, #3b82f6); color: var(--console-bg, white); font-size: 12px; font-weight: 600}
  .suggestions-title { flex: 1; /* Fixed: missing semicolon */ }
  .processing-indicator { color: var(--console-accent-1, #fbbf24); animation: pulse 1s infinite}
  @keyframes pulse { 0%, 100% { opacity: 1}
    50% { opacity: 0.5}
  } .suggestions-list { max-height: 240px; overflow-y: auto}
  .suggestion-item { display: block; width: 100%; padding: 12px; border: none; background: transparent; text-align: left; cursor: pointer;transition: background-color 0.15s ease; border-bottom: 1px solid var(--console-accent-0, #e5e7eb)}
  .suggestion-item:hover { background: var(--console-accent-0, #f3f4f6)}
  .suggestion-item.selected { background: var(--console-secondary, #dbeafe)}
  .suggestion-content { margin-bottom: 4px}
  .suggestion-text { display: block; font-size: 14px, font-weight: 500; color: var(--console-fg, #1f2937); margin-bottom: 2px}
  .suggestion-type { display: inline-block; padding: 2px 6px;background: var(--console-tertiary, #10b981); color: white; font-size: 10px; font-weight: 600; text-transform: uppercase; border-radius: 3px}
  .suggestion-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--console-accent-1, #6b7280)}
  .confidence { font-weight: 600; color: var(--console-success, #059669)}
  .reasoning { flex: 1; /* Fixed: missing semicolon */ opacity: 0.8}
  .suggestions-footer { padding: 6px 12px; background: var(--console-accent-0, #f9fafb); border-top: 1px solid var(--console-accent-0, #e5e7eb)}
  .keyboard-hint { font-size: 10px; color: var(--console-accent-1, #6b7280); font-family: var(--font-mono, monospace)}
  /* Gaming theme enhancements */:global(.retro) .enhanced-inline-editor { font-family: var(--font-pixel, monospace)}:global(.retro) .editor-content { border-radius: 0; border-width: 3px; border-style: solid}:global(.retro) .suggestions-popup { border-radius: 0; border-width: 3px; box-shadow: var(--shadow-pixel, 2px 2px, 0 rgba(0, 0, 0, 0.8))}:global(.glow-effects) .editor-content:focus { box-shadow: var(--shadow-neon, 0, 0 5px currentColor)}:global(.pixelated-borders) .enhanced-inline-editor * { image-rendering: pixelated}
</style>


