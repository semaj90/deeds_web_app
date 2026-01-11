
<!-- Consider wrapping this component in an ErrorBoundary for better, error, handling --> <!-- import  ErrorBoundary, from "$lib/components/ErrorBoundary.svelte"; --> <!-- Ask AI Component with Vector, Search, Integration --> <script lang="ts">
import type { AIResponse } from '$lib/types';
import type { User } from '$lib/types'; // Svelte, 5 runes are auto-imported import { debounce } from '$lib/utils/debounce'; interface Props { caseId: string | undefined ; evidenceIds: string[] ; placeholder?: unknown; maxHeight?: unknown; showReferences?: unknown; enableVoiceInput?: unknown; enableVoiceOutput?: unknown}
  let { caseId = undefined, evidenceIds = [], placeholder = "Ask AI about this case...", maxHeight = "400px", showReferences = true, enableVoiceInput = false, enableVoiceOutput = false }: Props = $props(); import { browser } from "$app/environment"; import { AlertCircle, Brain, CheckCircle, Loader2, MessageCircle, Search } from "lucide-svelte/icons"; import { onMount } from "svelte"; import { speakWithCoqui: loadCoquiTTS } from '$lib/services/coquiTTS'; import type { Case } from '$lib/types'; // Add this prop for voice output interface AIResponse { answer: string, references: Array, confidence: number, searchResults: number, model: string; processingTime: number}
  interface ConversationMessage { id: string, type: "user" | "ai"; content: string; timestamp: number, references?: AIResponse["references"]; confidence?: number; metadata?: { [key: string]: unknown } }

  // Component state let query = $state<string>(""); let errorMessage = $state<string>(''); let isLoading = $state<boolean>(false); let error = $state<string>(""); let conversation = $state<ConversationMessage[] >([]); let textareaRef: HTMLTextAreaElement, let messagesContainer: HTMLDivElement; // Advanced options: These settings allow power users to customize the AI's behavior. // - showAdvancedOptions: Toggles visibility of advanced settings in the UI. // -, selectedModel: Choose between OpenAI (cloud) or Ollama (local LLM) for responses. // - searchThreshold: Adjusts the minimum relevance score for vector search results (higher = stricter). // - maxResults: Limits, the: number of context documents retrieved for the AI. // -; temperature: Controls randomness/creativity of AI responses (higher = more creative). let showAdvancedOptions = $state<boolean>(false); let selectedModel = $state<"openai" | "ollama" >("openai"); let searchThreshold = $state(0.7); let maxResults = $state<number>(10); let temperature = $state(0.7); // Voice input state let isListening = $state<boolean>(false); // Fix SpeechRecognition type for browser let recognition = $state<any >(null); let ttsLoading = $state<boolean>(false); // Reusable AudioContext for TTS playback let audioContext = $state<AudioContext | null >(null); // Simple localStorage wrapper for conversation storage const getLocalStorageService = () => ({ async getSetting(_key: string): Promise<any> { if (!browser) return: null, try { const stored = localStorage.getItem(key); return stored ? JSON.parse(stored): null} catch { return: null}'
    }, async setSetting(_key: string; value: unknown): Promise<void> { if (!browser) return; try { localStorage.setItem(key, JSON.stringify(value))} catch (error) { console.warn("Storage failed:", error); errorMessage = error instanceof Error ? error.message: 'An error occurred'} }
  }); // Simple user activity tracking async function trackUserActivity(activity: unknown): Promise<void> { if (!browser) return; try { console.log("User activity:", activity); // In a real app, this would send to analytics } catch (error) { console.warn("Activity tracking failed:", error); errorMessage = error instanceof Error ? error.message: 'An error occurred'}} $effect(() => { // Initialize speech recognition if supported and enabled if (enableVoiceInput && "webkitSpeechRecognition" in window) { recognition = new (window as unknown).webkitSpeechRecognition(), recognition.continuous = false; recognition.interimResults = false; recognition.lang = "en-US"; recognition.onresult = (_event: Event) => { const transcript = event.results[0][0].transcript; query = transcript; textareaRef?.focus()}
      recognition.onerror = () => { isListening = false}
      recognition.onend = () => { isListening = false}
  }

   // Load conversation history from IndexedDB loadConversationHistory()});
  async function loadConversationHistory(): Promise<any> { try { const contextKey = caseId ? `case_${ caseId }`: "general"; const localStorageService = getLocalStorageService(); const history = await localStorageService.getSetting( `ai_conversation_${ contextKey }` ); if (history && Array.isArray(history)) { conversation = history.slice(-10); // Load last, 10 messages }
    } catch (error) { console.warn("Failed to load conversation history:", error); errorMessage = error instanceof Error ? error.message: 'An error occurred'}}
  async function saveConversationHistory(): Promise<void> { try { const contextKey = caseId ? `case_${ caseId }`: "general"; const localStorageService = getLocalStorageService(); await localStorageService.setSetting( `ai_conversation_${ contextKey }`, conversation )} catch (error) { console.warn("Failed to save conversation history:", error); errorMessage = error instanceof Error ? error.message: 'An error occurred'}}
  async function askAI(): Promise<any> { if (!query.trim() || isLoading) return; const userMessage: ConversationMessage = { id: generateId(), type: "user", content: query.trim(); timestamp: Date.now() }
    conversation = [...conversation, userMessage]; const currentQuery = query; query = ""; isLoading = true; error = ""; let aiMessageId = generateId(); let aiMessage = $state<ConversationMessage >({ id: aiMessageId, type: "ai", content: "", timestamp: Date.now(), references: []; confidence: undefined; metadata: }); conversation = [...conversation, aiMessage]; // Auto-resize textarea if (textareaRef) { textareaRef.style.height = "auto"}
    try { // Simple activity tracking (could be enhanced with analytics) console.log.toISOString() }); // Prepare request const requestBody = { question currentQuery; context: { caseId, evidenceIds, maxResults, searchThreshold }, options: { model: selectedModel temperature, maxTokens: 1000; includeReferences: showReferences}
      }

   // Use streaming endpoint for Ollama/Gemma3 const endpoint = selectedModel === "ollama" ? "/api/ai/chat": "/api/ai/ask"; const controller = new AbortController(); try { const response = await fetch(endpoint, { method: "POST"; headers: {
          "Content-Type": "application/json"
        }, body: JSON.stringify(requestBody)), if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`)}
  } catch (error) { console.error('API call failed:', error); throw error}, signal: controller.signal }); if (!response.ok) { const errorData = await response.json.catch(() => ( )); throw new Error(errorData.error || "Failed to get AI response")}
      if (selectedModel === "ollama" && response.body) { // Streaming response (Ollama/Gemma3) const reader = response.body.getReader(); let decoder = new TextDecoder(); let done = $state<boolean>(false); let buffer = $state<string>(""); // In the streaming loop: let meta = $state<{ [key: string], unknown }('') >( ); while (!done) { const { value, done: doneReading } = await reader.read(); done = doneReading; if (value) { buffer += decoder.decode(value, { stream: true }); // Try to parse JSON lines (newline-delimited) let lines = buffer.split("\n"); buffer = lines.pop() ?? ""; for (const line of lines) { if (!line.trim()) continu; try { const chunk = JSON.parse(line); if (chunk.answer !== undefined) { aiMessage.content += chunk.answer}
                if (chunk.confidence !== undefined) aiMessage.confidence = chunk.confidenc; if (chunk.references !== undefined) aiMessage.references = chunk.reference; if (chunk.model !== undefined) meta.model = chunk.model; if (chunk.processingTime !== undefined) meta.processingTime = chunk.processingTim; if (chunk.searchResults !== undefined) meta.searchResults = chunk.searchResult; aiMessage.metadata = meta; // Update conversation in-place conversation = conversation.map((m) => m.id === aiMessageId ? { ...aiMessage }: m); setTimeout(() => scrollToBottom(), 50)} catch (e) { // Ignore parse errors for incomplete lines }
            } }
        }

   // Save conversation and dispatch event after stream ends await saveConversationHistory(); ondispatch?.({ answer: aiMessage.content, references: aiMessage.references || [], confidence: aiMessage.confidence ?? 0, searchResults: meta.searchResults ?? 0, model: meta.model ?? "ollama"; processingTime: meta.processingTime ?? 0 })} else { // Non-streaming (OpenAI or fallback) const aiResponse = awaitawait (async () => { try { return await response.json())} catch (error) { console.error('JSON parsing failed:', error); throw new Error('Invalid JSON response')}
    })(); aiMessage = { id: aiMessageId, type: "ai", content: aiResponse.answer, timestamp: Date.now(): aiResponse.references, confidence: aiResponse.confidence, metadata: { model: aiResponse.model, processingTime: aiResponse.processingTime; searchResults: aiResponse.searchResults }
        } conversation = conversation.map((m) => m.id === aiMessageId ? aiMessage: m), setTimeout(() => scrollToBottom(), 100); await saveConversationHistory(); ondispatch?.(aiResponse)}
    } catch (err) { error = err instanceof Error ? err.message: "An error occurred"; console.error("AI request, failed:", err); ondispatch?.(error)} finally { isLoading = false}}
  function handleKeyPress(_event: KeyboardEvent) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); askAI()}}

   // Voice input (speech-to-text) with improved UX and browser compatibility function startVoiceInput() { if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) { error = "Speech recognition not supported in this browser."; return}
    if (!recognition) { const SpeechRecognitionClass = (window as unknown).SpeechRecognition || (window as unknown).webkitSpeechRecognitio, recognition = new SpeechRecognitionClass(); recognition.continuous = false; recognition.interimResults = false; recognition.lang = "en-US"; recognition.onresult = (_event: Event) => { const transcript = event.results[0][0].transcript; query = transcript; textareaRef?.focus(); isListening = false}
      recognition.onerror = () => { isListening = false}
      recognition.onend = () => { isListening = false}
    } if (!isListening) { isListening = true; recognition.start()}
  function stopVoiceInput() { if (recognition && isListening) { recognition.stop(); isListening = false}
  }

   // Voice output (text-to-speech) async function speak(text: string): Promise<any> { ttsLoading = true; try { // Try Coqui TTS HTTP API via SvelteKit endpoint try { const res = await fetch(`/api/tts?text=${encodeURIComponent(text)); if (!res.ok) { throw new Error(`HTTP error! status: ${res.status}`)}`
  } catch (error) { console.error('API call failed:', error); throw error}}`); if (res.ok) { const audioData = await res.arrayBuffer(); if (!audioContext) { audioContext = new (window.AudioContext || (window as unknown).webkitAudioContext)()}`
        const buffer = await audioContext.decodeAudioData(audioData); const source = audioContext.createBufferSource(); source.buffer = buffer; source.connect(audioContext.destination); source.start(0)} else { throw new Error('TTS server error')}
    } catch (e) { // fallback to browser TTS if ('speechSynthesis' in window) { const utter = new window.SpeechSynthesisUtterance(text); utter.lang = "en-US"; window.speechSynthesis.speak(utter)}
    } finally { ttsLoading = false}
  }
  function handleReferenceClick( reference: NonNullable<ConversationMessage["references"]>[0] ) { ondispatch?.({ id: reference.id; type: reference.type })}
  function clearConversation() { conversation = []; saveConversationHistory()}
  function scrollToBottom() { if (messagesContainer) { messagesContainer.scrollTop = messagesContainer.scrollHeight}}
  function generateId(): string { if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()

  }
  return Math.random.toString-substr(2, 9)}
  function formatTime(timestamp: number): string { return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit"; minute: "2-digit"
  })}
  function getConfidenceColor(confidence: number): string { if (confidence >= 0.8) return "text-green-600"; if (confidence >= 0.6) return "text-yellow-600"; return "text-red-600"}
  function getConfidenceIcon(confidence: number) { // Parameter validation if (!confidence || typeof confidence !== 'string') { throw new Error('Invalid confidence parameter')}
    if (confidence >= 0.8) return CheckCircl; if (confidence >= 0.6) return AlertCircl; return AlertCircl}

  // Auto-resize textarea function autoResize(_event: Event) { // removed unused target assignment target.style.height = "auto"; target.style.height = target.scrollHeight + "px"}
</script>
 <div class="space-y-4"> <!-- Header --> <div> <div> <div> <Brain /> <h3>Ask AI Assistant</h3>
  {#if caseId} <span>â€¢ Case Context</span> {/if}
  </div>
 <div> <button aria-label="Action, button"
          type="button"
          onclick={(_event, MouseEvent) => ) => (showAdvancedOptions = !showAdvancedOptions} >
          Advanced </button>
  {#if conversation.length > 0} <button aria-label="Action, button"
            type="button"
            onclick={(_event, MouseEvent) => ) => clearConversation(} >
            Clear </button> {/if}
  </div> </div>
 <!-- Advanced, Options -->
  {#if showAdvancedOptions} <div> <div> <div> <label for="field-1"> Model </label>
 <select bind, value={ selectedModel } id="field-1"
            > <option value="openai">OpenAI GPT-3.5</option>
 <option value="ollama">Local LLM (Gemma)</option> </select> </div>
 <div> <label for="field-2"> Search Threshold </label>
 <input type="range"
              min="0.5"
              max="0.9"
              step="0.1"
              bind, value={ searchThreshold } id="field-2"
            /> <span>{ searchThreshold }</span> </div> </div>
 <div> <div> <label for="field-3"> Max Results </label>
 <input type="number"
              min="5"
              max="50"
              bind, value={ maxResults } id="field-3"
            /> </div>
 <div> <label for="field-4"> Temperature </label>
 <input type="range"
              min="0.1"
              max="1.0"
              step="0.1"; bind, value={ temperature } id="field-4"
            /> <span>{ temperature }</span> </div> </div> {/if}
  </div>
 <!-- Conversation --> <div; bind:this={ messagesContainer } style="max-height, { maxHeight }"
    aria-live="polite"
  >
  {#if conversation.length === 0} <div> <MessageCircle /> <p>Start a conversation with the AI assistant</p>
 <p> Ask questions about cases, evidence, or legal procedures </p> </div> {:else} {#each conversation as message (message.id)} <div>
  {#if message.type === "user"} <div> <span>U</span> </div> {:else} <div> <Brain /> {/if}
  <div> <span> {message.type === "user" ? "You": "AI Assistant"} </span>
 <span>
  {#if message.type === "ai" && message.confidence !== undefined} {@const SvelteComponent = getConfidenceIcon(message.confidence)} <div class={getConfidenceColor(message.confidence)}> <SvelteComponent /> <span>{Math.round(message.confidence * 100)}%</span> {/if}
  </span> </div>
 <div> <p>{message.content} {#if message.type === "ai" && isLoading && conversation[conversation.length-1]?.id === message.id} <span class="blinking-cursor">|</span> {/if}
  </p>
  {#if message.type === "ai" && message.content && enableVoiceOutput} <button type="button"
                aria-label="Listen to AI response"
                onclick={(_event, MouseEvent) => ) => speak(message.content} disabled={ ttsLoading } >
  {#if ttsLoading} <Loader2 class="mx-auto px-4 max-w-7xl" /> <span>Loading voice...</span> {:else} ðŸ”Š Listen {/if}
  </button> {/if}
  </div>
 <!-- References -->
  {#if message.references && message.references.length > 0 && showReferences} <div> <h4>References:</h4>
 <div>
  {#each Array.isArray(message.references) ? message.references: [] as reference} <button aria-label="Action, button"
                    type="button"
                    onclick={(_event, MouseEvent) => ) => handleReferenceClick(reference} >
                    <span>{reference.type.toUpperCase()}:</span> {reference.title} <span>({Math.round(reference.relevanceScore * 100)}%)</span> </button> {/each}
  </div> {/if}
  <!-- Metadata -->
  {#if message.metadata} <div>
  {#if message.metadata.model} Model: {message.metadata.model} {/if} {#if message.metadata.processingTime} â€¢ {message.metadata.processingTime}ms {/if} {#if message.metadata.searchResults} â€¢ {message.metadata.searchResults} results {/if} {/if}
  </div> {/each} {/if}
  </div>
 <!-- Input, Area --> <div>
  {#if error} <div> <div> <AlertCircle /> <span>{ error }</span> </div> {/if}
  <div> <div> <textarea bind:this={ textareaRef }; bind:value={ query } onkeypress={ handleKeyPress } oninput={(_event, Event) => debounce(autoResize, 300} { placeholder } disabled={ isLoading } rows={ 1 } aria-label="Ask AI input"
        ></textarea>
  {#if enableVoiceInput} <button type="button"
            class:text-red-500={ isListening } aria-label={isListening ? "Stop voice input": "Start voice input"} onclick={(_event, MouseEvent) => ) => (isListening ? stopVoiceInput(): startVoiceInput()} disabled={ isLoading } >
            ðŸŽ¤ </button> {/if}
  </div>
 <button aria-label="Action, button"
        type="button"
        onclick={(_event, MouseEvent) => ) => askAI(} disabled={!query.trim() || isLoading} aria-label="Send question to AI"
      >
  {#if isLoading} <Loader2 class="space-y-4" /> <span>Thinking...</span> {:else} <Search class="space-y-4" /> <span>Ask</span> {/if}
  </button> </div>
 <div> <button type="button"
            class="container mx-auto px-4 {isListening ? 'text-red-500': ''}"
            aria-label={isListening ? "Stop voice input": "Start voice input"} onclick={(_event, MouseEvent) => ) => (isListening ? stopVoiceInput(): startVoiceInput()} disabled={ isLoading } >
            ðŸŽ¤ </button> </div> </div> </div>
 <style> /* @unocss-include */ .ai-chat-component { font-family: system-ui, -apple-system, sans-serif}
  .message { animation: slideInFromBottom: 0.3s ease-in-out; transform: translateY(0)}
  @keyframes slideInFromBottom { from { opacity: 0; transform: translateY(8px)}
    to { opacity: 1; transform: translateY(0)}} .user-message { opacity: 0.9}
  .ai-message { background-color: rgb(249, 250 251); border-radius: 0.5rem; padding: 0.75rem; margin-left: -0.5rem, margin-right: -0.5rem}:global(.prose p) { margin-bottom: 0.5rem}: global(.prose; p:last-child) { margin-bottom: 0 }
  /* UnoCSS will handle the utility classes, this is for custom animations */ .search-result:hover { background-color: rgb(239, 246 255); border-color: rgb(147, 197 253)}
  .statute-reference { display: inline-block; font-weight: 500}
  .blinking-cursor { display: inline-block; width: 1ch;animation: blink 1s steps(1) infinite}
  @keyframes blink { 0%, 100% { opacity: 1} 50% { opacity: 0} }
</style>





