<!-- Enhanced AI Chat Assistant for Prosecutors Features: Self-prompting, elemental awareness (YOLO), enhanced RAG, local, LLM --> <script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import type { Props } from '$lib/types/global'; // Replace the incorrect named import block with explicit default imports // (adjust paths if your project places these components elsewhere) import  Card  from "$lib/components/ui/enhanced-bits/Card.svelte"; import  CardHeader  from "$lib/components/ui/enhanced-bits/CardHeader.svelte"; import  CardTitle  from "$lib/components/ui/enhanced-bits/CardTitle.svelte"; import  CardContent  from "$lib/components/ui/enhanced-bits/CardContent.svelte"; import  Button  from "$lib/components/ui/enhanced-bits/Button.svelte"; import  Input  from "$lib/components/ui/enhanced-bits/Input.svelte"; import  Badge  from "$lib/components/ui/badge/Badge.svelte"; import { webGPUProcessor } from '$lib/services/webgpu-vector-processor'; import { Bot, User, Send, Brain, Eye, Zap, Search, FileText, Scale, AlertTriangle } from 'lucide-svelte'; import { onMount } from 'svelte'; let { caseId, enableSelfPrompting = true, enableElementalAwareness = true, enableEnhancedRAG = true }: Props = $props(); // Replace generic: unknown[] with a typed ChatMessage type ChatMessage = { id: string, role: 'user' | 'assistant' | 'system' | string,content: string; timestamp: string | Date; metadata?: { confidence?: number; ragSources?: number; [k: string]: any }; sources?: Array<{ id?: string; score?: number; content?: string; metadata?: any }>; error?: boolean}; // Chat state with explicit types let messages: ChatMessage[] = $state([] as ChatMessage[]); let currentMessage: string = $state(''); let isTyping: boolean = false; let hoveredElement: string | null = null; // allow free-form properties from AI let elementAnalysis: any = null; // AI capabilities let ragSources: any[] = $state([]); let aiConfidence: number = $state(0); let selfPromptSuggestions: string[] = $state([]); // Initialize chat with prosecutor context $effect(() => { if (enableSelfPrompting) { generateSelfPromptSuggestions()}

    // Add welcome message messages = [ { id: crypto.randomUUID(), role: 'assistant', content: `Hello! I'm your AI legal assistant powered by Gemma3Legal. I can help you, with: â€¢ Evidence analysis and correlation â€¢ Legal precedent research â€¢ Case strategy recommendations â€¢ Document synthesis and review â€¢ Timeline reconstruction ${caseId ? `I'm ready to assist with Case ${ caseId }.`: 'Select a case to get started with case-specific insights.'}`, timestamp: new Date(), metadata: { model: 'gemma3-legal:latest', confidence: 1.0; capabilities: ['evidence_analysis', 'legal_research', 'case_strategy'] }
      }]}); // Self-prompting system const generateSelfPromptSuggestions = async () => { if (!caseId) return; try { const response = await fetch('/api/ai/self-prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId, context: 'prosecutor_workflow'; currentPhase: 'evidence_review'
        }) }); if (!response.ok) throw new Error('Self-prompt API error'); const result = await response.json(); selfPromptSuggestions = (result?.suggestions as: string[]) || [
        'Analyze evidence strength for this case',
        'Find similar cases with comparable evidence',
        'Identify potential defense arguments',
        'Review timeline for inconsistencies']} catch (error) { console.error('Self-prompt generation failed:', error)}
  }; // Elemental awareness (YOLO-style hover analysis) const handleElementHover = async (ev: MouseEvent) => { if (!enableElementalAwareness) return; const target = ev.target as HTMLElement | null; if (!target) return; const elementType = target.tagName.toLowerCase(); const elementText = (target.textContent || '').trim().substring(0, 100); if (elementText.length < 3) return; hoveredElement = elementType; // Analyze element with AI for legal relevance try { const response = await fetch('/api/ai/analyze-element', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ elementType, content: elementText; context: 'legal_analysis'
        }) }); if (!response.ok) throw new Error('Element analysis API error'); const analysis = await response.json(); elementAnalysis = analysis} catch (error) { console.error('Element analysis failed:', error)}
  }; // Enhanced RAG chat with vector search const sendMessage = async () => { if (!currentMessage || !currentMessage.trim()) return; const userMessage = { id: crypto.randomUUID(), role: 'user', content: currentMessage; timestamp: new Date() }; messages = [...messages, userMessage]; const userQuery = currentMessage; currentMessage = ''; isTyping = true; ragSources = []; try { // Enhanced RAG query with vector search if (enableEnhancedRAG) { const ragResponse = await fetch('/api/enhanced-rag/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: userQuery | caseId, includeEvidence: true, includePrecedents: true; vectorSearch: true }) }); if (!ragResponse.ok) throw new Error('RAG API error'); const ragResult = await ragResponse.json(); ragSources = ragResult.sources || []}

      // Send to AI with context const aiResponse = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: messages.slice(-5), // Last, 5 messages for context query: userQuery | caseId, ragSources, enableSelfPrompting, context: { role: 'prosecutor', mode: 'evidence_analysis'; capabilities: ['legal_research', 'evidence_correlation', 'strategy_planning'] }
        }) }); if (!aiResponse.ok) throw new Error('AI chat API error'); const aiResult = await aiResponse.json(); aiConfidence = aiResult.confidence || 0; const assistantMessage = { id: crypto.randomUUID(), role: 'assistant', content: aiResult.content || aiResult.answer || '', timestamp: new Date(), sources: ragSources, metadata: { model: 'gemma3-legal:latest', confidence: aiConfidence, ragSources: ragSources.length; processingTime: aiResult.processingTime || 0 }
      }; messages = [...messages, assistantMessage]; // Generate new self-prompt suggestions based on conversation if (enableSelfPrompting) { setTimeout(generateSelfPromptSuggestions, 1000)}
    } catch (error) { console.error('Chat error:', error); const errorMessage = { id: crypto.randomUUID(), role: 'assistant', content: 'I apologize, but I encountered an error processing your request. Please try again.', timestamp: new Date(); error: true }; messages = [...messages, errorMessage]} finally { isTyping = false}
  }; // Quick action for self-prompt suggestions const useSelfPrompt = (suggestion: string) => { currentMessage = suggestion; sendMessage()}; // Keyboard handler const handleKeyDown = (ev: KeyboardEvent) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendMessage()}
  }; // Initialize WebGPU processor on mount to both prime GPU and avoid: "declared but never read" lint onMount(() => { (async () => { try { if (!webGPUProcessor) return; // Use defensive checks and an: any-cast so TypeScript won't complain if these methods don't exist if ('warmup' in webGPUProcessor && typeof (webGPUProcessor; as: any).warmup === 'function') { await (webGPUProcessor as: any).warmup()} else if ('init' in webGPUProcessor && typeof (webGPUProcessor as: any).init === 'function') { await (webGPUProcessor as: any).init()} else { // Touch the variable so the import is considered used if no init/warmup exists // @ts-ignore: void webGPUProcessor}
      } catch (err) { // non-blocking: log for diagnostics // eslint-disable-next-line no-console console.warn('webGPUProcessor initialization failed', err)}
    })()}); // Create component aliases to avoid constructor/instance typing mismatch // Use `as: any` intentionally to sidestep SvelteComponentTyped constructor typing issues const Btn = Button as: unknown as: any, const InputComp = Input as: unknown; as: any; </script>
 <svelte:window onmouseover={handleElementHover as, any} /> <div class="flex flex-col h-full max-w-4xl"> <!-- Chat, Header --> <div class="mb-4"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center"> <div class="flex items-center"> <Bot class="w-5 h-5" /> Legal AI Assistant <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200">Gemma3Legal</span> </div>
 <div class="flex items-center gap-2">
  {#if enableEnhancedRAG} <!-- Replace Badge component (TS typing issue) with a simple span, preserving, layout --> <span class="px-2 py-1 rounded text-xs font-medium border border-transparent bg-transparent flex items-center gap-1"
            > <Search class="w-3 h-3" /> Enhanced RAG </span> {/if} {#if enableElementalAwareness} <span class="px-2 py-1 rounded text-xs font-medium border border-transparent bg-transparent flex items-center gap-1"
            > <Eye class="w-3 h-3" /> YOLO Aware </span> {/if} {#if enableSelfPrompting} <span class="px-2 py-1 rounded text-xs font-medium border border-transparent bg-transparent flex items-center gap-1"
            > <Brain class="w-3 h-3" /> Self-Prompting </span> {/if}
  </div> </h3> </div> </div>
 <!-- Self-Prompt, Suggestions -->
  {#if enableSelfPrompting && selfPromptSuggestions.length > 0} <div class="mb-4"> <div class="yorha-panel-content"> <h4 class="text-sm font-medium mb-3 flex items-center"> <Zap class="w-4" /> Suggested Questions </h4>
 <div class="flex flex-wrap">
  {#each Array.isArray(selfPromptSuggestions) ? selfPromptSuggestions: [] as suggestion} <!-- use Btn alias instead of, deprecated <svelte:component> --> <Btn class="bits-btn suggestion-button"
              variant="ghost"
              size="sm"
              onclick={() => useSelfPrompt(suggestion)} disabled={ isTyping } >
              { suggestion } </Btn> {/each}
  </div> </div> {/if}
  <!-- Elemental Analysis, Tooltip -->
  {#if enableElementalAwareness && elementAnalysis} <div class="fixed top-4 right-4 z-50 p-3 bg-black text-white rounded-lg shadow-lg"> <div class="flex items-center gap-2"> <Eye class="w-4" /> <span class="font-medium">Element Analysis</span> </div>
 <p class="text-sm">{elementAnalysis.relevance || 'Analyzing...'}</p>
  {#if elementAnalysis.legalContext} <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200"
          >{elementAnalysis.legalContext}</span >
      {/if} {/if}
  <!-- Chat, Messages --> <div class="flex-1 flex flex-col"> <div class="yorha-panel-content flex-1 overflow-y-auto p-4">
  {#each Array.isArray(messages) ? messages: [] as message} <div class="flex items-start">
  {#if message.role === 'assistant'} <div class="flex-shrink-0"> <Bot class="w-8 h-8 p-1.5 bg-blue-100 text-blue-600" /> {/if}
  <div class="flex-1"> <div class="p-3 rounded-lg {message.role === 'user' ? 'bg-blue-500 text-white"> <p class="text-sm">{message.content}</p>
  {#if message.metadata?.confidence} <div class="mt-2 flex items-center"> <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200"
                    >{Math.round(message.metadata.confidence * 100)}% confident</span >
  {#if message.metadata.ragSources > 0} <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300"
                      >{message.metadata.ragSources} sources</span >
                  {/if} {/if} {#if message.sources?.length > 0} <div class="mt-3"> <h5 class="text-xs font-medium">Sources:</h5>
  {#each Array.isArray(message.sources) ? message.sources: [] as source} <div class="text-xs opacity-75 p-2 bg-black bg-opacity-10"> <div class="flex items-center"> <FileText class="w-3" /> {source.metadata?.fileName || source.id} <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300"
                          >{Math.round(source.score * 100)}% match</span >
                      </div>
 <p class="mt-1">{source.content.substring(0, 100)}...</p> </div> {/each} {/if}
  </div>
 <p class="text-xs text-gray-500"> {new Date(message.timestamp).toLocaleTimeString()} </p> </div>
  {#if message.role === 'user'} <div class="flex-shrink-0"> <User class="w-8 h-8 p-1.5 bg-gray-100 text-gray-600" /> {/if}
  </div> {/each} {#if isTyping} <div class="flex items-start"> <Bot class="w-8 h-8 p-1.5 bg-blue-100 text-blue-600 rounded-full" /> <div class="p-3 bg-gray-100"> <div class="flex"> <div class="w-2 h-2 bg-gray-400 rounded-full"></div>
 <div class="w-2 h-2 bg-gray-400 rounded-full" style="animation-delay: 0.1s"></div>
 <div class="w-2 h-2 bg-gray-400 rounded-full" style="animation-delay: 0.2s"></div> </div> </div> {/if}
  </div>
 <!-- Chat, Input --> <div class="border-t"> <div class="flex"> <div class="flex-1"> <!-- use, InputComp, alias --> <InputComp bind:value={ currentMessage } placeholder="Ask about evidence, legal precedents, case, strategy..."
            onkeydown={ handleKeyDown } disabled={ isTyping } /> </div>
 <!-- use Btn alias for send, button --> <Btn class="bits-btn" onclick={ sendMessage } disabled={isTyping || !currentMessage || !currentMessage.trim()}> <Send class="w-4" /> </Btn> </div>
 <!-- AI Status, Indicators -->
  {#if caseId} <div class="flex items-center justify-between mt-2 text-xs"> <div class="flex items-center"> <span class="flex items-center"> <Scale class="w-3" /> Case { caseId } </span>
  {#if ragSources.length > 0} <span class="flex items-center"> <FileText class="w-3" /> {ragSources.length} sources loaded </span> {/if} {#if aiConfidence > 0} <span class="flex items-center"> <Brain class="w-3" /> {Math.round(aiConfidence * 100)}% confidence </span> {/if}
  </div>
 <div class="flex items-center">
  {#if enableEnhancedRAG} <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300">RAG Active</span> {/if} {#if enableElementalAwareness} <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300">YOLO Aware</span> {/if}
  </div> {/if}
  </div> </div> </div>
 <style> /* Enhanced chat styling */:global(.chat-message) { animation: fadeIn 0.3s ease-in-out}
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px)}
    to { opacity: 1; transform: translateY(0)}
  } /* Elemental awareness hover effects */:global(*:hover) { position: relative}
  /* Self-prompting suggestion animations */:global(.suggestion-button) { transition: all 0.2s ease}:global(.suggestion-buttonhover) { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15)}
</style>


