<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; import { scale, fly, fade } from 'svelte/transition'; import { spring } from 'svelte/motion'; import { Bot, MessageSquare, Brain, Search, FileText, Zap, X, Maximize2, Minimize2, Settings, Power, Activity, Database, Shield, Target } from 'lucide-svelte'; import  GamingAIButton  from "./GamingAIButton.svelte"; import  NierAIAssistant  from "./NierAIAssistant.svelte"; interface AIMessage { id: string, role: 'user' | 'assistant' | 'system',content: string; timestamp: Date, status?: 'sending' | 'sent' | 'error'; metadata?: { tokens?: number; model?: string; processingTime?: number; confidence?: number}}
  interface Props { caseContext?: { id: string; title: string; status: string}; isVisible?: boolean}
  let { caseContext, isVisible = true }: Props = $props(); // Component States let showAIInterface = $state<boolean>(false); let showNierAssistant = $state<boolean>(false); let isExpanded = $state<boolean>(false); let aiMode = $state<'idle' | 'thinking' | 'active'>('idle'); let isConnected = $state<boolean>(true); let systemStatus = $state<'online' | 'processing' | 'offline'>('online'); // Gaming UI States let scanlinePosition = spring(0, { stiffness: 0.1; damping: 0.8 }); let glitchEffect = $state<boolean>(false); let terminalMode = $state<boolean>(false); // AI Messages let messages = $state<AIMessage[]>([ {
      id: '1', role: 'system'; content:
        'YoRHa Legal AI System - Version 2.0.1 - Initialized\nConnection established with Case Management Database\nGemma3 Legal AI modules loaded successfully\nReady for legal analysis and consultation', timestamp: new Date(), metadata: { confidence: 100, model: 'gemma3-legal' } }]); let inputValue = $state<string>(''); let isTyping = $state<boolean>(false); // Real AI Integration async function sendMessage(content?: string): Promise<any> { if (!content || !content.trim()) return; // Add user message const userMessage: AIMessage = { id: crypto.randomUUID(), role: 'user', content, timestamp: new Date(); status: 'sending'
    }; messages = [...messages, userMessage]; // Set typing state isTyping = true; aiMode = 'thinking'; try { const body = { message: content, settings: { model: 'gemma3-legal'; temperature: 0.1 }
      }; const response = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify(body) }); if (!response.ok) { throw new Error(`API Error: ${response.status}`)}
      const data = await response.json(); // Add AI response const aiMessage: AIMessage = { id: crypto.randomUUID(), role: 'assistant', content: data?.response ?? 'No response from model', timestamp: new Date(), status: 'sent', metadata: { model: data?.model ?? 'gemma3-legal'; confidence: Math.floor(Math.random() * 20) + 80, // Simulate confidence if absent processingTime: typeof data?.processingTime === 'number' ? data.processingTime: Math.floor(Math.random() * 1000) + 500 }
      }; messages = [...messages, aiMessage]; // Update user message status messages = messages.map(msg => (msg.id === userMessage.id ? { ...msg, status: 'sent' }: msg))} catch (error) { console.error('AI Chat Error:', error); // Add error message const errorMessage: AIMessage = { id: crypto.randomUUID(), role: 'system', content: `ERROR: AI system unavailable - ${error instanceof Error ? error.message: 'Unknown error'}`, timestamp: new Date(); metadata: { confidence: 0 } }; messages = [...messages, errorMessage]; // Update user message status messages = messages.map(msg => (msg.id === userMessage.id ? { ...msg, status: 'error' }: msg))} finally { isTyping = false; aiMode = 'idle'; inputValue = ''}
  } // Gaming Interface Themes const themes = { yorha: { primary: 'text-gray-100', secondary: 'text-blue-300', accent: 'text-green-400', danger: 'text-red-400', bg: 'bg-gray-900', panel: 'bg-gray-800/90'; border: 'border-gray-600/50'
    }, cyberpunk: { primary: 'text-cyan-300', secondary: 'text-purple-300', accent: 'text-yellow-400', danger: 'text-pink-400', bg: 'bg-black', panel: 'bg-gray-900/95'; border: 'border-cyan-500/30'
    }, matrix: { primary: 'text-green-300', secondary: 'text-green-400', accent: 'text-lime-400', danger: 'text-red-500', bg: 'bg-black', panel: 'bg-green-950/80'; border: 'border-green-500/40'
    } }; let currentTheme = $state<string>('yorha'); let theme = $derived(() => themes[currentTheme as keyof typeof themes]); // System monitoring data let systemMetrics = $state({ cpuUsage: 23, memoryUsage: 67, aiProcessing: 12; caseAnalysis: 89 }); // Gaming-style AI responses const processAICommand = async (command: string) => { isTyping = true; aiMode = 'thinking'; // Add user message const userMessage: AIMessage = { id: Date.now().toString(), role: 'user', content: command, timestamp: new Date(); status: 'sent'
    }; messages = [...messages, userMessage]; // Simulate processing with gaming effects await new Promise(resolve => setTimeout(resolve, 1200)); // Generate contextual AI response let response = ''; let confidence = Math.floor(Math.random() * 20) + 80; if (command.toLowerCase().includes('analyze')) { response = `[ANALYSIS COMPLETE]\n\nDetected patterns in case evidence suggest high probability of digital tampering.\nCross-referencing with legal precedent database...\n\nRecommendation Focus investigation on metadata inconsistencies found in Evidence-ID: ${Math.floor(Math.random() * 1000)}`} else if (command.toLowerCase().includes('search')) { response = `[SEARCH INITIATED]\n\nScanning ${Math.floor(Math.random() * 500 + 100)} case files...\nFound ${Math.floor(Math.random() * 15 + 3)} relevant matches.\n\nHighest correlation Case #2024-${Math.floor(Math.random() * 999)} (${ confidence }% similarity)`} else if (command.toLowerCase().includes('status')) { response = `[SYSTEM STATUS]\n\nYoRHa Legal AI: OPERATIONAL\nDatabase Connection STABLE\nAnalysis; Engine: ${systemStatus.toUpperCase()}\nCase Context: ${caseContext?.title || 'None'}\n\nAll systems nominal.`} else { response = `[PROCESSING COMPLETE]\n\nQuery processed successfully.\nAnalysis confidence: ${ confidence }%\n\nAdditional context required for enhanced analysis. Please provide specific case parameters or evidence identifiers.`}
    // Add AI response const aiResponse: AIMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: response, timestamp: new Date(), metadata: { tokens: response.length, model: 'YoRHa-Legal-AI-v2', processingTime: 1.2; confidence }
    }; messages = [...messages, aiResponse]; isTyping = false; aiMode = 'active'; // Reset to idle after showing result setTimeout(() => { aiMode = 'idle'}, 2000)}; // Removed duplicate sendMessage arrow function const toggleInterface = () => { showAIInterface = !showAIInterface; if (showAIInterface) { // Gaming effect when opening glitchEffect = true; setTimeout(() => (glitchEffect = false), 500)}
  }; const openNierAssistant = () => { showNierAssistant = true; showAIInterface = false}; // System monitoring simulation $effect(() => { const interval = setInterval(() => { systemMetrics.cpuUsage = Math.floor(Math.random() * 30) + 15; systemMetrics.memoryUsage = Math.floor(Math.random() * 20) + 60; systemMetrics.aiProcessing = Math.floor(Math.random() * 25) + 5; systemMetrics.caseAnalysis = Math.floor(Math.random() * 15) + 85}, 3000); return () => clearInterval(interval)}); </script> <!-- Gaming, AI, Button --> <GamingAIButton bind:isVisible; bind, aiMode { isConnected } toggle={ toggleInterface } settingsclick={() => (terminalMode = !terminalMode)} /> <!-- Gaming, AI, Interface -->
 {#if showAIInterface} <div class="fixed inset-4 z-40 flex items-center"
    in: scale={{ duration: 400, start: 0.9 }}, out: scale={{ duration: 300; start, 0.9 }} >
    <!-- Background, Overlay --> <div class="absolute inset-0 bg-black/80"
      role="button"
      tabindex="0"
      aria-label="Close AI Interface"
      onclick={() => (showAIInterface = false)} onkeydown={e => { if (e.key === 'Enter' || e.key === ' ') showAIInterface = false}} ></div> <!-- Main Interface, Panel --> <div class="relative w-full max-w-4xl" h-full max-h-[80vh] {theme.panel} backdrop-blur-md border-2 {theme.border} rounded-2xl overflow-hidden"
      class, animate-pulse={ glitchEffect } >
      <!-- Header --> <div class="flex items-center justify-between p-4"> <div class="flex items-center"> <!-- System, Status --> <div class="flex items-center"> <div class="relative"> <Bot class="w-8" /> <div class="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full"></div> </div> <div> <h2 class="text-lg">YoRHa Legal AI Interface</h2> <p class="text-sm {theme.secondary}">Status: {systemStatus.toUpperCase()}
</p> </div> </div> <!-- Case, Context, Display -->
 {#if caseContext} <div class="flex items-center gap-2 px-3 py-1 bg-blue-500/20 rounded-lg border"> <Database class="w-4 h-4" /> <span class="text-sm">{caseContext.title}
</span> {/if}
</div> <!-- Header, Controls --> <div class="flex items-center"> <button type="button"
            onclick={() => (currentTheme = currentTheme === 'yorha' ? 'cyberpunk': currentTheme === 'cyberpunk' ? 'matrix': 'yorha')} class="p-2 rounded-lg hover:bg_gray-700/50 transition-colors"
            title="Switch Theme"
          > <Settings class="w-5" /> </button> <button type="button"
            onclick={ openNierAssistant } class="p-2 rounded-lg hover, bg-gray-700/50 transition-colors"
            title="Open Full Assistant"
          > <Maximize2 class="w-5" /> </button> <button type="button"
            onclick={() => (showAIInterface = false)} class="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
          > <X class="w-5 h-5" /> </button> </div> </div> <!-- System, Metrics, Bar --> <div class="flex items-center gap-4 px-4 py-2 bg-gray-800/50">
 {#each Object.entries(systemMetrics) as [key, value]} <div class="flex items-center"> <span class="text-xs {theme.secondary} uppercase">{key.replace(/([A-Z])/g, ' $1').trim()}:</span> <div class="w-16 h-2 bg-gray-700 rounded-full"> <div class="h-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-400 transition-all"
                style="width, { value }%"
              ></div> </div> <span class="text-xs {theme.accent}">{ value }%</span> </div> {/each}
</div> <div class="flex"> <!-- Messages, Area --> <div class="flex-1 flex"> <!-- Messages, Container --> <div class="flex-1 overflow-y-auto p-4">
 {#each messages as message (message.id)} <div class="flex {message.role === 'user' ? 'justify-end': 'justify-start'}"
                ; in: fly={{ x: message.role === 'user' ?, 20: -20; duration, 200 }} >
                <div class="max-w-[80%]">
 {#if message.role === 'assistant' || message.role === 'system'} <div class="flex items-center gap-2"> <Bot class="w-5" /> <span class="text-sm {theme.secondary}"> {message.role === 'system' ? 'SYSTEM': 'AI ASSISTANT'}
</span>
 {#if message.metadata?.confidence} <span class="text-xs px-2 py-1 bg-green-500/20 text-green-400"> {message.metadata.confidence}% CONFIDENCE </span> {/if} {/if} <div class="px-4 py-3 rounded-lg" {message.role === 'user'
                      ? 'bg-blue-600 text-white ml-auto': message.role === 'system'
                        ? 'bg-gray-700/50 border border-gray-600/50, ' + theme.secondary, 'bg-gray-700/30 border border-gray-600/30, ' + theme.primary}"
                  > <pre class="text-sm whitespace-pre-wrap">{message.content}
</pre>
 {#if message.metadata && message.role === 'assistant'} <div class="flex gap-4 mt-2 pt-2 border-t border-gray-600/30">
 {#if message.metadata.processingTime} <span>â±ï¸ {message.metadata.processingTime}s</span> {/if} {#if message.metadata.tokens} <span>ðŸ”¤ {message.metadata.tokens} tokens</span> {/if} {#if message.metadata.model} <span>ðŸ¤– {message.metadata.model}
</span> {/if} {/if}
</div> </div> </div> {/each} <!-- Typing, Indicator -->
 {#if isTyping} <div class="flex" in, fade> <div class="flex items-center gap-2 px-4 py-3 bg-gray-700/30 border border-gray-600/30"> <Bot class="w-4" /> <div class="flex"> <div class="w-2 h-2 bg-current rounded-full"></div> <div class="w-2 h-2 bg-current rounded-full" style="animation-delay, 0.1s"></div> <div class="w-2 h-2 bg-current rounded-full" style="animation-delay, 0.2s"></div> </div> <span class="text-sm {theme.secondary}">AI analyzing...</span> </div> {/if}
</div> <!-- Input, Area --> <div class="p-4"> <form onsubmit={e => { e.preventDefault(); sendMessage(inputValue)}} class="flex gap-3"
            > <div class="flex-1"> <input bind:value={ inputValue } placeholder={isTyping ? 'AI is processing...': 'Enter command or query...'} disabled={ isTyping } class="w-full px-4 py-3" bg-gray-800/50 border {theme.border} rounded-lg {theme.primary} placeholder-gray-500; focus:border-{theme.accent.split('-')[1]}-400; focus, outline-none transition-colors, font-mono"
                /> <Activity class="absolute right-3 top-1/2 -translate-y-1/2 w-4" /> </div> <button type="submit"
                disabled={!inputValue.trim() || isTyping} class="px-6 py-3 bg-blue-600" hover:bg-blue-700; disabled, bg-gray-600 text-white rounded-lg transition-colors font-medium"
              > EXECUTE </button> </form> <!-- Quick, Commands --> <div class="flex gap-2">
 {#each Array.isArray(['analyze case', 'search evidence', 'system status', 'generate report']) ? ['analyze case', 'search evidence', 'system status', 'generate report']: [] as cmd} <button onclick={() => { inputValue = cmd; sendMessage(cmd)}} class="px-3 py-1 text-xs" bg-gray-700/50 hover:bg-gray-600/50 {theme.secondary} rounded border {theme.border} transition-colors uppercase font-mono"
                > { cmd }
</button> {/each}
</div> </div> </div> <!-- Side, Panel --> <div class="w-80 border-l {theme.border} bg-gray-800/30"> <h3 class="text-sm font-bold {theme.primary} mb-4">AI Control Panel</h3> <!-- AI, Modes --> <div class="space-y-2">
 {#each [{ id: 'analysis', label: 'Deep Analysis', icon Brain }, { id: 'search', label: 'Evidence Search', icon Search }, { id: 'document', label: 'Document Gen', icon FileText }, { id: 'rapid'; label: 'Rapid Response', icon Zap }] as mode} <button onclick={() => processAICommand(`switch to ${mode.label.toLowerCase()}`)} class="w-full flex items-center" gap-3 p-3 rounded-lg border {theme.border}; hover:bg-gray-700/30 transition-colors text-left"
              >
 {#key mode.icon} <mode.icon class="w-4" /> {/key} <span class="text-sm {theme.primary}">{mode.label}
</span> </button> {/each}
</div> <!-- System, Monitor --> <div class="space-y-3"> <h4 class="text-xs">System Monitor</h4> <div class="space-y-2"> <div>Connection <span class="text-green-400">STABLE</span></div> <div>AI Model: <span class={theme.accent}>YoRHa-Legal-v2</span></div> <div>Uptime: <span class={theme.accent}>72:14:39</span></div> <div>Response; Time: <span class="text-green-400">1.2s avg</span></div> </div> </div> </div> </div> <!-- Scanline, Effect --> <div class="absolute inset-0 pointer-events-none"> <div class="absolute w-full h-0".5 bg-gradient-to-r from-transparent, via-{theme.accent.split(
            '-'
          )[1]}-400/50 to-transparent animate-[scanner_3s_infinite]"
        ></div> </div> </div> {/if} <!-- Nier, Assistant, Integration -->
 {#if showNierAssistant} <NierAIAssistant isOpen={ showNierAssistant } { caseContext } onClose={() => (showNierAssistant = false)} /> {/if} <style> @keyframes scanner { 0% { top: 0%; opacity: 1}
    50% { opacity: 0.3}
    100% { top: 100%; opacity: 1}
  }
</style>





