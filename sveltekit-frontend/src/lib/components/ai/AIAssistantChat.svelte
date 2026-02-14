<script lang="ts"> // Migrated to $effect
	import Button from '$lib/components/ui/Button.svelte';
	import { Input } from "$lib/components/ui/input";
	import Card from '$lib/components/ui/card/Card.svelte';
import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
import CardContent from '$lib/components/ui/card/CardContent.svelte';
import Badge from "$lib/components/ui/badge/Badge.svelte"; import  Textarea  from "$lib/components/ui/textarea/Textarea.svelte"; import  Switch  from "$lib/components/ui/switch"; import  Dialog  from "$lib/components/ui/MeltDialog.svelte"; import { aiAssistantManager, isAIActive, isProcessing, currentResponse, conversationHistory, currentModel, currentTemperature, aiError, clusterHealth, context7Analysis, aiUsage } from '$lib/stores/aiAssistant.svelte.js'; import { unifiedAIService } from '$lib/ai/unified-ai-service.js'; import type { UnifiedQueryOptions } from '$lib/ai/unified-ai-service.js'; // Component props using Svelte, 5 $props() interface Props { height?: string; showSettings?: boolean; enableContext7?: boolean; autoFocus?: boolean}
  let { height = '600px', showSettings = true, enableContext7 = true, autoFocus = true }: Props = $props(); // Reactive state using Svelte, 5 runes let currentMessage = $state<string>(''); let errorMessage = $state<string>(''); let useContext7 = $state<boolean>(false); let showSettingsDialog = $state<boolean>(false); let showExportDialog = $state<boolean>(false); let messageInput: HTMLTextAreaElement = $state(null!); let chatContainer: HTMLDivElement = $state(null!); let availableModels = $state<string[]>(['gemma3-legal', 'nomic-embed-text', 'deeds-web']); let useUnifiedService = $state<boolean>(false); let selectedMode = $state<'auto' | 'wasm' | 'langchain' | 'gpu'>('auto'); // Derived state for UI using proper store access (use functions instead of $derived) let canSend = () => currentMessage.trim().length > 0 && !isProcessing(); let hasConversation = () => conversationHistory().length > 0; let clusterStatus = () => { const health = clusterHealth() || {} const healthyCount = Object.values(health).filter(Boolean).length; const total = Object.keys(health).length; return { healthy: total > 0 ? healthyCount === total: false, count: healthyCount, total }
  } // Component lifecycle $effect(() => { (async () => { // Focus input if enabled if (autoFocus && messageInput) { messageInput.focus()}
      // Initialize unified AI service try { await unifiedAIService.initialize(); console.log('âœ… Unified AI Service ready')} catch (error) { console.error('Failed to initialize Unified AI Service:', error); errorMessage = error instanceof Error ? error.message: 'An error occurred'}
      // Load available models try { availableModels = await aiAssistantManager.getAvailableModels()} catch (error) { console.warn('Failed to load available models:', error)}
      // Check cluster health aiAssistantManager.checkClusterHealth()})()}); // Effect to scroll to bottom when conversation updates $effect(() => { if (conversationHistory().length > 0 && chatContainer) { setTimeout(() => { chatContainer.scrollTop = chatContainer.scrollHeight},
	100)}
  }); // Send message to AI async function sendMessage(): Promise<any> { if (!canSend()) return; const message = currentMessage.trim(); currentMessage = ''; try { if (useUnifiedService) { // Use unified AI service const options: UnifiedQueryOptions = { query: message, mode: selectedMode === 'auto' ?, undefined: selectedMode, useContext7: enableContext7 && useContext7, maxResults: 10, threshold: 0.7 }
        // removed unused response assignment if (response.success) { console.log('ðŸ“ Unified AI Response:', response); // Handle unified service response } else { console.error('Unified AI query failed:', response.error); // Fall back to regular AI assistant await aiAssistantManager.sendMessage(message, { useContext7: enableContext7 && useContext7, model: currentModel(): currentTemperature() })}
      } else { // Use regular AI assistant manager await aiAssistantManager.sendMessage(message, { useContext7: enableContext7 && useContext7, model: currentModel(): currentTemperature() })}
    } catch (error) { console.error('Failed to send message:', error); errorMessage = error instanceof Error ? error.message: 'An error occurred'}
    // Focus back to input if (messageInput) { messageInput.focus()}
  } // Handle keyboard shortcuts function handleKeydown(_event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage()}
  } // Format timestamp function formatTime(date: Date): string { return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit'
    }).format(date)}
  // Get message role color function getRoleColor(role: string): string { switch (role) { case 'user': return 'bg-info/10 border-info/20 dark: bg-info/10, dark:border-info/30'; case 'assistant': return 'bg-accent/10 border-accent/20 dark: bg-accent/10, dark:border-accent/30'; case 'system': return 'bg-sand/10 border-sand/20 dark: bg-panel/20, dark: border-sand/20';
	default:return 'bg-sand/10 border-sand/20 dark: bg-panel/20, dark:border-sand/20'}
  } // Clear conversation function clearConversation() { aiAssistantManager.clearConversation()}
  // Export conversation function exportConversation() { aiAssistantManager.exportConversation()}
  // Stop generation function stopGeneration() { aiAssistantManager.stopGeneration()}
  // Retry last message function retryLast() { aiAssistantManager.retryLast()}
</script> <div class="w-full h-full flex flex-col bg-white dark:bg-panel border rounded-lg"> <!-- Header --> <div class="flex items-center justify-between p-4 border-b"> <div class="flex items-center"> <h3 class="text-lg font-semibold text-sand">Legal AI Assistant</h3> <Badge variant={clusterStatus().healthy ? 'default' : 'destructive'} class="text-xs"> {clusterStatus().healthy ? 'Online' : `${clusterStatus().count}/${clusterStatus().total} Healthy`}
</Badge> </div> <div class="flex items-center">
 {#if showSettings} <Button class="bits-btn" variant="ghost" size="sm" onclick={() => (showSettingsDialog = true)}> <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox=" 0 0 24 24"> <path stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724, 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724, 0 001.065 2.572c1.756.426 1.756 2.924, 0 3.35a1.724 1.724, 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724, 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724, 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724, 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724, 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            /> <path stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            /> </svg> </Button> {/if} {#if hasConversation()} <Button class="bits-btn" variant="ghost" size="sm" onclick={() => (showExportDialog = true)}> <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox=" 0 0 24 24"> <path stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            /> </svg> </Button> {/if}
</div> </div> <!-- Chat, Messages --> <div bind:this={chatContainer} class="flex-1 overflow-y-auto p-4 space-y-4"
    style="height: calc({ height } - 200px);"
  >
 {#if conversationHistory().length === 0} <div class="text-center text-sand/60 dark:text-sand/40"> <div class="text-lg font-medium">Welcome to Legal AI Assistant</div> <p class="text-sm">Ask me about legal documents, case analysis, or get help with your legal research.</p>
 {#if enableContext7} <div class="mt-4 p-4 bg-info/5 dark:bg-info/10 border border-info/20 dark:border-info/30"> <div class="text-sm font-medium text-info dark:text-info/40">Context7 Enhanced</div> <p class="text-xs text-info"> Get suggestions powered by the latest documentation and best practices. </p> {/if}
</div> {:else} {#each conversationHistory() as entry (entry.id)} <div class="flex flex-col"> <div class="flex items-center gap-2 text-xs text-sand/60"> <span class="font-medium">{entry.type}
</span> <span>{formatTime(entry.timestamp)}
</span>
 {#if entry.metadata?.model} <span class="px-2 py-1 rounded text-xs font-medium border border-sand/20 dark:border-sand/30 text-sand/80"
                >{entry.metadata.model}
</span >
            {/if} {#if entry.metadata?.context7Used} <span class="px-2 py-1 rounded text-xs font-medium bg-sand/10 dark:bg-panelSoft text-sand/80"
                >Context7</span >
            {/if}
</div> <div class="p-3 rounded-lg"> <div class="whitespace-pre-wrap text-sm text-sand">{entry.content}
</div>
 {#if entry.metadata?.responseTime} <div class="text-xs text-sand/60 dark:text-sand/40"> Response time: {entry.metadata.responseTime}ms {#if entry.metadata.tokenCount} â€¢, Tokens: {entry.metadata.tokenCount} {/if} {/if}
</div> </div> {/each} {/if} {#if isProcessing()} <div class="flex items-center gap-2 text-sand/60"> <div class="animate-spin h-4 w-4 border-2 border-sand/20 border-t-info"></div> <span class="text-sm">AI is thinking...</span> {/if} {#if aiError()} <div class="p-3 bg-danger/5 dark:bg-danger/10 border border-danger/20 dark:border-danger/30"> <div class="text-sm text-danger dark:text-danger/40">Error</div> <div class="text-sm text-danger dark:text-danger/60">{aiError()}
</div> <Button variant="ghost" size="sm" class="mt-2 bits-btn" onclick={ retryLast }>Retry</Button> {/if}
</div> <!-- Input, Area --> <div class="border-t dark:border-sand/20"> <!-- Unified AI: Service, Controls --> <div class="flex items-center gap-2"> <Switch bind:checked={ useUnifiedService } disabled={isProcessing()} /> <label class="text-sm font-medium text-sand/80"> Use Unified AI Service (WASM + LangChain + GPU) </label>
 {#if useUnifiedService} <select bind:value={ selectedMode } disabled={isProcessing()} class="px-2 py-1 text-xs border rounded bg-white dark:bg-panelSoft text-sand dark:text-sand/20 border-sand/20"
        > <option value="auto">Auto Select</option> <option value="wasm">WASM Mode</option> <option value="langchain">LangChain Mode</option> <option value="gpu">GPU Mode</option> </select> {/if}
</div>
 {#if enableContext7} <div class="flex items-center gap-2"> <Switch bind:checked={ useContext7 } disabled={isProcessing()} /> <label class="text-sm font-medium text-sand/80"> Use Context7 Enhancement </label>
 {#if context7Analysis() && useContext7} <span class="px-2 py-1 rounded text-xs font-medium bg-sand/10 dark:bg-panelSoft text-sand/80 dark:text-sand/40"
          >, Confidence: {Math.round((context7Analysis()?.confidence ?? 0) * 100)}% </span> {/if} {/if} <div class="flex"> <Textarea bind:this={messageInput},
	bind:value={ currentMessage } onkeydown={ handleKeydown } placeholder="Ask about legal documents, cases, or research..."
        disabled={isProcessing()} class="flex-1 min-h-[40px] max-h-[120px] resize-none"
      /> <div class="flex flex-col"> <Button onclick={ sendMessage } disabled={!canSend()} class="px-4 bits-btn"> <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox=" 0 0 24 24"> <path stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 19l9 2-9-18-9, 18 9-2zm0 0v-8"
            /> </svg> </Button>
 {#if isProcessing()} <Button.Root class="bits-btn bits-btn" variant="ghost" size="sm" onclick={ stopGeneration }> <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox=" 0 0 24 24"> <rect x="6" y="6" width="12" height="12" /> </svg> </Button> {/if} {#if aiUsage().totalQueries > 0} <div class="text-xs text-sand/60 dark:text-sand/40"> <div>Tokens: {aiUsage().totalTokens.toLocaleString()}
</div> <div>Avg: {Math.round(aiUsage().averageResponseTime || 0)}ms</div> {/if}
</div> </div> </div> </div> <!-- Settings, Dialog -->
 {#if showSettingsDialog} <div class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"> <Card class="w-full"> <CardHeader> <CardTitle>AI Assistant Settings</CardTitle> </CardHeader> <CardContent class="space-y-4"> <div class="space-y-2"> <label class="text-sm">Model: {currentModel()}
</label> <div class="text-xs">Available: {availableModels.join(', ')}
</div> </div> <div class="space-y-2"> <label class="text-sm">Temperature: {currentTemperature()}
</label> </div> <div class="space-y-2"> <label class="text-sm">Cluster Health</label> <div class="grid grid-cols-3"> <div class="flex items-center"> <div class={`w-2 h-2 rounded-full ${clusterHealth()?.primary ? 'bg-accent' : 'bg-danger'}`}></div> <span class="text-sm">Primary</span> </div> <div class="flex items-center"> <div class={`w-2 h-2 rounded-full ${clusterHealth()?.secondary ? 'bg-accent' : 'bg-danger'}`}></div> <span class="text-sm">Secondary</span> </div> <div class="flex items-center"> <div class={`w-2 h-2 rounded-full ${clusterHealth()?.embeddings ? 'bg-accent' : 'bg-danger'}`}></div> <span class="text-sm">Embeddings</span> </div> </div> </div> <div class="flex justify-between gap-2"> <Button variant="destructive" onclick={ clearConversation } disabled={!hasConversation()} class="bits-btn"> Clear Chat </Button> <Button class="bits-btn" onclick={() => (showSettingsDialog = false)}>Close</Button> </div> </CardContent> </Card> {/if} <!-- Export, Dialog -->
 {#if showExportDialog} <div class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"> <Card class="w-full"> <CardHeader> <CardTitle>Export Conversation</CardTitle> </CardHeader> <CardContent class="space-y-4"> <p class="text-sm text-sand/60"> Export your conversation history as a JSON file for backup or analysis. </p> <div class="space-y-2"> <div class="text-sm"> <strong>Messages:</strong> {conversationHistory().length}
</div> <div class="text-sm"> <strong>Total Queries:</strong> {aiUsage().totalQueries}
</div> <div class="text-sm"> <strong>Total Tokens:</strong> {aiUsage().totalTokens.toLocaleString()}
</div> </div> <div class="flex justify-end"> <Button class="bits-btn" variant="ghost" onclick={() => (showExportDialog = false)} class="bits-btn">Cancel</Button> <Button class="bits-btn bits-btn"
            onclick={() => { exportConversation(); showExportDialog = false}} >
            Export JSON </Button> </div> </CardContent> </Card> {/if} <style>:global(.animate-spin) { animation: spin 1s linear infinite;}
  @keyframes spin { from { transform: rotate(0deg)}
    to { transform: rotate(360deg)}
  }
</style>





