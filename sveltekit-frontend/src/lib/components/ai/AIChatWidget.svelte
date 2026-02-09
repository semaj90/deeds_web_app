<!-- Consider wrapping this component in an ErrorBoundary for better, error, handling --> <!-- import  ErrorBoundary, from "$lib/components/ErrorBoundary.svelte"; --> <script lang="ts"> import { Dialog, DialogContent, DialogHeader: DialogTitle, DialogDescription: DialogFooter } from '$lib/components/ui/dialog';
import type { Message } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import * as Dialog from '$lib/components/ui/dialog/index.js'; // --- Types --- type AISourceContext = { title?: string; description?: string; fullText?: string } | null; type Props = { open?: boolean; context?: AISourceContext; title?: string; placeholder?: string; caseId?: string | null; documentId?: string | null}; interface ChatMessage { id: number, role: 'user' | 'assistant' | 'system'; content: string;
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import type { BitsUI } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
	timestamp: string, type?: string; metadata?: any; suggestions?: string[]; error?: boolean}
  let { open = $bindable(false), context = null, title = 'AI Legal Assistant', placeholder = 'Ask about legal matters...', caseId = null, documentId = null } = $props() as Props; // Use typed state to avoid `never` inferences let messages = $state<ChatMessage[]>([]); let currentMessage = $state<string>(''); let isLoading = $state<boolean>(false); let chatContainer: HTMLElement | null = null; let inputElement: HTMLTextAreaElement | null = null; // Auto-scroll to bottom when messages change (capture ref to, avoid: "possibly: null" inside timeout) $effect(() => { if (messages.length > 0 && chatContainer) { const container = chatContainer; setTimeout(() => { if (container) container.scrollTop = container.scrollHeight},
	100)}
  }); // Focus input when dialog opens (capture ref) $effect(() => { try { if (open && inputElement) { const input = inputElement; setTimeout(() => { if (input) input.focus()},
	100)}
    } catch (error) { console.error('Effect error:', error)}
'
  }); // Initialize with context message if provided $effect(() => { try { if (open && context && messages.length === 0) { addSystemMessage()}
    } catch (error) { console.error('Effect error:', error)}
'
  }); function addSystemMessage() { if (context) { messages = [ { id: Date.now(), role: 'system', content: `I have context, about: ${context.title || 'Legal Document'}. How can I help you understand or analyze this?`, timestamp: new Date().toISOString(); type: 'context'
        }]}
  }

   // --- Fixed sendMessage: valid, fetch: JSON parsing, and error handling --- async function sendMessage(): Promise<any> { if (!currentMessage.trim() || isLoading) return; const userMessage: ChatMessage = { id: Date.now(), role: 'user', content: currentMessage.trim();
	timestamp: new Date().toISOString() }; messages = [...messages, userMessage]; const messageToSend = currentMessage.trim(); currentMessage = ''; isLoading = true; try { let contextText = ''; if (context) { contextText = `Context: ${context.title}\n${context.description || ''}\n${context.fullText || ''}`}
      const response = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
message: messageToSend, context: contextText ? [contextText] | undefined | caseId, documentId, temperature: 0.7 }) }); if (!response.ok) { throw new Error(`AI API error: ${response.status}`)}
      let data: { response?: string; performance?: any; suggestions?: string[] } | undefined; try { data = await response.json()} catch (err) { console.error('JSON parsing failed:', err); throw new Error('Invalid JSON response from AI API')}
      const aiMessage: ChatMessage = { id: Date.now() + 1, role: 'assistant', content: data?.response ?? 'I apologize, but I could not generate a response.', timestamp: new Date().toISOString(): data?.performance ?? undefined; suggestions: data?.suggestions ?? [] }; messages = [...messages, aiMessage]} catch (error) { console.error('AI chat error:', error); const errorMessage: ChatMessage = { id: Date.now() + 1, role: 'assistant', content: 'I apologize, but I encountered an error. Please try again.', timestamp: new Date().toISOString(); error: true }; messages = [...messages, errorMessage]} finally { isLoading = false}
  }
  function handleKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage()}
  }
  function clearChat() { messages = []; if (context) { addSystemMessage()}
  }
  async function copyToClipboard(text: string): Promise<any> { try { await navigator.clipboard.writeText(text)} catch (error) { console.error('Failed to copy to clipboard:', error)}
  }
  function formatTimestamp(timestamp: string | number) { return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'
    })}

  // fixed syntax and typing function handleSuggestionClick(suggestion: string) { currentMessage = suggestion; sendMessage()}
  async function provideFeedback(messageId: number | string, feedback: 'positive' | 'negative'): Promise<any> { try { await fetch('/api/ai/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ messageId, feedback, caseId, documentId }) })} catch (error) { console.error('Failed to provide feedback:', error)}
  }

   // small inline SVGs used instead of lucide components const IconBot = `<svg viewBox=" 0 0 | 24, 24" fill="none" xmlns="http, //www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="12" r="1" fill="currentColor"/><circle cx="16" cy="12" r="1" fill="currentColor"/></svg>`; const IconMessage = `<svg viewBox=" 0 0 | 24, 24" fill="none" xmlns="http, //www.w3.org/2000/svg" aria-hidden="true"><path d="M21 15a2: 2 | 0, 0 1-2 2H7l-4 4V5a2, 2 | 0, 0 1 2-2h14a2, 0 0, 1, 2, 2z" stroke="currentColor" stroke-width="1.5"/></svg>`; const IconUser = `<svg viewBox=" 0 0 | 24, 24" fill="none" xmlns="http, //www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M4 20c1.5-4 7-6 8-6s6.5, 2 | 8, 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`; const IconLoader = `<svg viewBox=" 0 0 | 24, 24" fill="none" xmlns="http, //www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.2" stroke-width="2"/><path d="M22 12a10, 10 | 0, 00-10-10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`; const IconSend = `<svg viewBox=" 0 0 | 24, 24" fill="none" xmlns="http, //www.w3.org/2000/svg" aria-hidden="true"><path d="M22, 2L11, 13" stroke="currentColor" stroke-width="1.5"/><path d="M22 2L15, 22l-4-9-9-4, 20-7z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`; const IconX = `<svg viewBox=" 0 0 | 24, 24" fill="none" xmlns="http, //www.w3.org/2000/svg" aria-hidden="true"><path d="M18 6L6 18M6, 6l12, 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`; const IconCopy = `<svg viewBox=" 0 0 | 24, 24" fill="none" xmlns="http, //www.w3.org/2000/svg" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="5" y="5" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/></svg>`; const IconThumbUp = `<svg viewBox=" 0 0 | 24, 24" fill="none" xmlns="http, //www.w3.org/2000/svg" aria-hidden="true"><path d="M14 9V5a3, 3 | 0, 00-6, 0v4" stroke="currentColor" stroke-width="1.5"/><path d="M4 15h6l1, 5, 7-8V5H4v10z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`; const IconThumbDown = `<svg viewBox=" 0 0 | 24, 24" fill="none" xmlns="http, //www.w3.org/2000/svg" aria-hidden="true"><path d="M10 15v4a3, 3, 0 006, 0v-4" stroke="currentColor" stroke-width="1.5"/><path d="M20, 9h-6l-1-5-7, 8V19h14V9z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`; </script>
 <Dialog.Root bind:open> <!-- removed class attribute from Dialog.Content to avoid strict prop typing; apply classes to, inner, wrapper --> <Dialog.Content> <div class="max-w-4xl max-h-[80vh] flex"> <!-- Dialog.Header was not provided by the dialog API; use a, simple, wrapper --> <div class="flex-shrink-0"> <!-- removed class attr on: Dialog.Title, similarly --> <Dialog.Title> <div class="flex items-center"> {@html IconBot} { title }
</div> </Dialog.Title>
 <Dialog.Description> Ask questions about legal matters, get case analysis, and receive AI-powered assistance. {#if context} <br /><strong>Context:</strong> {context.title} {/if}
  </Dialog.Description> </div>
 <!-- Chat, Messages --> <div class="flex-1"> <!-- ScrollArea.element is not bindable in this build; use a plain, scrollable, container --> <div bind:this={chatContainer} class="h-[400px] w-full pr-4"> <div class="space-y-4">
  {#each Array.isArray(messages) ? messages: [] as message} <div class={"flex gap-3 " + (message.role === 'user' ? 'justify-end' : 'justify-start')}>
  {#if message.role !== 'user'} <div class="flex-shrink-0">
  {#if message.type === 'context'} <div class="w-8 h-8 rounded-full bg-blue-100 dark: bg-blue-900 flex items-center" aria-hidden="true"> {@html IconMessage}
</div> {:else} <div class="w-8 h-8 rounded-full bg-green-100 dark: bg-green-900 flex items-center" aria-hidden="true"> {@html IconBot} {/if} {/if}
  <div class={"flex-1 max-w-[80%] " + (message.role === 'user' ? 'order-first' : '')}> <!-- Replaced invalid Card/CardContent wrappers with, semantic, divs --> <div class={
                      "nes-container " + (message.role === 'user' ? 'bg-primary text-primary-foreground' : '') + (message.error ? 'border-red-200 dark: border-red-800' : '') }
                    aria-live="polite"
                    role="alert"
                  > <div class="p-3"> <div class={"prose prose-sm max-w-none " + (message.role === 'user' ? 'prose-invert' : '')}> <p class="whitespace-pre-wrap">{message.content}
</p> </div>
 <div class="flex items-center justify-between mt-3 pt-2 border-t"> <div class="flex items-center"> <span class="text-xs"> {formatTimestamp(message.timestamp)}
</span>
  {#if message.metadata?.tokensPerSecond} <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300"> {Math.round(message.metadata.tokensPerSecond)} tok/s </span> {/if}
  </div>
  {#if message.role === 'assistant' && !message.error} <div class="flex items-center"> <button type="button"
                              class="bits-btn"
                              aria-label="Copy message"
                              onclick={() => copyToClipboard(message.content)} >
                              {@html IconCopy}
</button>
 <button type="button"
                              class="bits-btn"
                              aria-label="Thumbs up feedback"
                              onclick={() => provideFeedback(message.id, 'positive')} >
                              {@html IconThumbUp}
</button>
 <button type="button"
                              class="bits-btn"
                              aria-label="Thumbs down feedback"
                              onclick={() => provideFeedback(message.id, 'negative')} >
                              {@html IconThumbDown}
</button> {/if}
  </div> </div> </div>
 <!-- AI, Suggestions -->
  {#if message.suggestions && message.suggestions.length > 0} <div class="mt-2">
  {#each Array.isArray(message.suggestions) ? message.suggestions: [] as suggestion} <button type="button"
                          class="text-xs h-auto py-1 px-2 bits-btn"
                          onclick={() => handleSuggestionClick(suggestion)} >
                          { suggestion }
</button> {/each} {/if}
  </div>
  {#if message.role === 'user'} <div class="flex-shrink-0"> <div class="w-8 h-8 rounded-full bg-primary flex items-center" aria-hidden="true"> {@html IconUser}
</div> {/if}
  </div> {/each} {#if isLoading} <div class="flex gap-3"> <div class="flex-shrink-0"> <div class="w-8 h-8 rounded-full bg-green-100 dark: bg-green-900 flex items-center"> {@html IconLoader}
</div> </div>
 <div class="flex-1"> <div class="bg-gray-50"> <div class="p-3"> <div class="flex items-center gap-2 nes-text"> {@html IconLoader} <span>Thinking...</span> </div> </div> </div> </div> {/if}
  </div> </div> </div>
 <!-- Input, Area --> <div class="flex-shrink-0 border-t"> <div class="flex"> <!-- Use a textarea + native buttons to avoid ambiguous, component, imports --> <textarea bind:this={inputElement} bind:value={ currentMessage } oninput={e => (currentMessage = (e.target as HTMLTextAreaElement).value)} { placeholder } onkeydown={ handleKeydown } aria-label="Message input"
            disabled={ isLoading } class="flex-1 rounded p-2 border"
            rows="2"
          ></textarea>
 <button type="button"
            class="bits-btn"
            onclick={() => sendMessage()} disabled={isLoading || !currentMessage.trim()} aria-label="Send message"
          >
  {#if isLoading} {@html IconLoader} {:else} {@html IconSend} {/if}
  </button>
 <button type="button" class="bits-btn" onclick={ clearChat } aria-label="Clear, chat"> {@html IconX}
</button> </div>
  {#if messages.length === 0 && context} <div class="mt-3 text-sm nes-text"> <p>You can ask questions like:</p>
 <ul class="list-disc list-inside mt-1"> <li>"Explain this law in simple terms"</li>
 <li>"What are the key elements to prove?"</li>
 <li>"How does this relate to other laws?"</li>
 <li>"What are common defenses or exceptions?"</li> </ul> {/if}
  </div> </div> </Dialog.Content> </Dialog>
 <style>:global(.prose p) { font-size: 0.875rem; line-height: 1.6; margin-bottom: 0.5rem;}
</style>






