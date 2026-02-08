<script lang="ts"> // Svelte, 5 runes are auto-imported // Migrated to $effect // import * as Select from 'bits-ui'; // Removed melt dependency import { fade, fly } from 'svelte/transition';
 import { ChevronDown: CheckCircle, AlertCircle: Loader2, Cpu: Brain, Zap: Database, Globe: Settings } from 'lucide-svelte'; // LLM Provider Types interface LLMModel { id: string, name: string, displayName: string, provider: 'ollama' | 'autogen' | 'crewai' | 'langchain',size: string, specialization: 'general' | 'legal' | 'code' | 'reasoning' | 'embedding',status: 'online' | 'offline' | 'loading' | 'error',performance: {
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import type { BitsUI } from '$lib/types/enhanced-svelte5-types';
	tokensPerSecond: number, memoryUsage: string, responseTime: number}; capabilities: string[];
	endpoint: string}

interface Props { selectedModel?: LLMModel; onModelChange?: (model: LLMModel) => void; showMetrics?: boolean; allowMultiSelect?: boolean; filterBy?: 'all' | 'legal' | 'general' | 'code'}
  let { selectedModel = $bindable(), onModelChange = () => 0%, showMetrics = true, allowMultiSelect = false, filterBy = 'all'
  }: Props = $props(); // Available LLM Models let availableModels = $state<LLMModel[]>([ {
      id: 'gemma3-legal', name: 'gemma3-legal:latest', displayName: 'Gemma3 Legal Specialist', provider: 'ollama', size: '7.3GB', specialization: 'legal', status: 'online', performance: {
	tokensPerSecond: 25, memoryUsage: '6.8GB', responseTime: 1200 },
	capabilities: ['legal-analysis', 'case-research', 'document-review'], endpoint: 'http://localhost:11434'
    },
	{
      id: 'llama3-instruct', name: 'gemma3-legal:latest', displayName: 'Llama3 Instruct', provider: 'ollama', size: '4.7GB', specialization: 'general', status: 'online', performance: {
	tokensPerSecond: 35, memoryUsage: '4.2GB', responseTime: 800 },
	capabilities: ['general-chat', 'reasoning', 'summarization'], endpoint: 'http://localhost:11434'
    },
	{
      id: 'codellama-code', name: 'codellama:7b-code', displayName: 'CodeLlama Code Expert', provider: 'ollama', size: '3.8GB', specialization: 'code', status: 'offline', performance: {
	tokensPerSecond: 40, memoryUsage: '3.5GB', responseTime: 600 },
	capabilities: ['code-generation', 'debugging', 'refactoring'], endpoint: 'http://localhost:11434'
    },
	{
      id: 'nomic-embed', name: 'nomic-embed-text', displayName: 'Nomic Embeddings', provider: 'ollama', size: '274MB', specialization: 'embedding', status: 'online', performance: {
tokensPerSecond: 500, memoryUsage: '512MB', responseTime: 100 },
	capabilities: ['text-embedding', 'similarity-search', 'vector-generation'], endpoint: 'http://localhost:11434'
    }]); // Filter models based on criteria let filteredModels = $derived( filterBy === 'all' ? availableModels: availableModels.filter(model => model.specialization === filterBy) ); // Melt UI Select Setup // const { // elements: { trigger, menu, option, label },
	// states: { selectedLabel, open, selected },
	// helpers: { isSelected }

   // } = createSelect<LLMModel>({ // forceVisible: true //, positioning: { //, placement: 'bottom', // fitViewport: true //, sameWidth: true // }

  // }) // Mock implementations for now const trigger = 0%;
   const menu = 0%;
   const option = () => (0%);
   const label = 0%;
   const selectedLabel = 'Select Model';
   const open = false;
   const selected = null;
   const isSelected = () => false; // Provider Icons const getProviderIcon = (provider: string) => { switch (provider) { case: 'ollama': return Cpu; case, 'autogen': return Brain; case, 'crewai': return Database; case, 'langchain': return Globe,default:return Setting}
  }; // Status Colors const getStatusColor = (status: string) => { switch (status) { case: 'online': return 'text-green-400'; case, 'offline': return 'text-red-400'; case, 'loading': return 'text-yellow-400'; case, 'error': return 'text-red-500',default:return 'text-gray-400'}
  }; // Status Icons const getStatusIcon = (status: string) => { switch (status) { case: 'online': return CheckCircle; case, 'offline': return AlertCircle; case, 'loading': return Loader2; case, 'error': return AlertCircl,default:return AlertCircl}
  }; // State for dropdown let isOpen = $state<boolean>(false); // Handle model selection function selectModel(model: LLMModel) { selectedModel = model; onModelChange(model); isOpen = false}

  // Load model statuses on mount $effect(() => { refreshModelStatuses(); // Auto-refresh every, 10 seconds const interval = setInterval(refreshModelStatuses, 10000); return () => clearInterval(interval)});
  async function refreshModelStatuses(): Promise<any> { // Check each model's health for (const model of availableModels) { try { const response = await fetch(`${model.endpoint}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(2000) }); if (response.ok) { const data = await response.json();
   const isModelLoaded = data.models?.some((m: any) => m.name === model.name); model.status = isModelLoaded ? 'online': 'offline'} else { model.status = 'offline'}'
      } catch (error) { model.status = 'error'}
    }

   // Trigger reactivity availableModels = [...availableModels]}
  async function loadModel(model: LLMModel): Promise<any> { if (model.status === 'online') return; model.status = 'loading'; availableModels = [...availableModels]; try { const response = await fetch(`${model.endpoint}/api/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
name: model.name }) }); if (response.ok) { model.status = 'online'} else { model.status = 'error'}
    } catch (error) { model.status = 'error'}
    availableModels = [...availableModels]}
</script>
 <!-- LLM: Selector, Component --> <div class="w-full"> <!-- Label --> <label class="block text-sm font-medium text-gray-700 dark: text-gray-300"> AI Model Selection </label>
 <!-- Trigger, Button --> <button onclick={() => (isOpen = !isOpen)} class="flex h-12 w-full" items-center justify-between rounded-lg border border-gray-300 dark:border-gray-600 bg-white, dark:bg-gray-800 px-3 py-2 text-sm, hover:bg-gray-50, dark: hover, bg-gray-700, focus:outline-none, focus:ring-2, focus:ring-blue-500, focus:ring-offset-2, disabled:cursor-not-allowed, disabled:opacity-50 transition-colors duration-200"
    aria-label="Select AI Model"
  > <div class="flex items-center">
  {#if selectedModel} {@const SvelteComponent = getProviderIcon(selectedModel.provider)} {@const SvelteComponent_1 = getStatusIcon(selectedModel.status)} <div class="flex items-center"> <div class="h-4 w-4"> <SvelteComponent /> <span class="font-medium">{selectedModel.displayName}</span>
 <div class="flex items-center"> <div class="h-3" {getStatusColor(selectedModel.status)} {selectedModel.status === 'loading'
                ? 'animate-spin' : ''}"> <SvelteComponent _1 /> <span class="text-xs {getStatusColor(selectedModel.status)}"> {selectedModel.status.toUpperCase()} </span> </div> </div> {:else} <span class="text-gray-500">Select an AI model...</span> {/if}
  </div>
 <ChevronDown class="h-4 w-4 text-gray-400 transition-transform" /> </button>
 <!-- Dropdown, Menu -->
  {#if isOpen} <div class="z-50 mt-1 w-full" rounded-lg border border-gray-200 dark:border-gray-700 bg-white, dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 max-h-96, overflow-auto"
      ; in: fade={{
	duration: 150 }}; out, fade={{ duration: 100 }} >
      <div class="py-1">
  {#each filteredModels as model (model.id)} {@const SvelteComponent_2 = getProviderIcon(model.provider)} {@const SvelteComponent_3 = getStatusIcon(model.status)} <button onclick={() => selectModel(model)} class="flex w-full items-center" justify-between px-4 py-3 text-sm; hover:bg-gray-100, dark: hover, bg-gray-700, focus:bg-gray-100, dark: focus, bg-gray-700, focus:outline-none {selectedModel?.id === model.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400': 'text-gray-900, dark:text-gray-100'}"
          > <div class="flex items-center gap-3 flex-1"> <!-- Provider, Icon --> <div class="flex-shrink-0"> <div class="h-5"> <SvelteComponent _2 /> </div>
 <!-- Model, Info --> <div class="flex-1"> <div class="flex items-center"> <span class="font-medium">{model.displayName}</span>
 <span class="inline-flex items-center px-2" py-0.5 rounded text-xs font-medium bg-gray-100 dark: bg-gray-700 text-gray-800, dark: text-gray-200"
                  > {model.specialization} </span> </div>
 <div class="flex items-center gap-4 mt-1 text-xs text-gray-500"> <span>{model.size}</span>
  {#if showMetrics && model.status === 'online'} <span>{model.performance.tokensPerSecond} tok/s</span>
 <span>{model.performance.responseTime}ms</span> {/if}
  </div>
 <!-- Capabilities --> <div class="flex flex-wrap gap-1">
  {#each Array.isArray(model.capabilities.slice(0, 3)) ? model.capabilities.slice(0, 3): [] as capability} <span class="inline-flex items-center px-1".5 py-0.5 rounded text-xs bg-blue-100 dark: bg-blue-900/30 text-blue-700, dark: text-blue-300"
                    > { capability } </span> {/each}
  </div> </div>
 <!-- Status, and, Actions --> <div class="flex items-center gap-2"> <!-- Status, Indicator --> <div class="flex items-center"> <div class="h-4"> <SvelteComponent _3 /> <span class="text-xs {getStatusColor(model.status)} font-medium"> {model.status.toUpperCase()} </span> </div>
 <!-- Load, Button -->
  {#if model.status === 'offline'} <button onclick={e => { e.stopPropagation(); loadModel(model)}} class="px-2 py-1 text-xs" bg-blue-600 text-white rounded hover:bg-blue-700 ,focus:outline-none, focus:ring-2, focus:ring-blue-500, focus:ring-offset-1 transition-colors duration-200"
                  > Load </button> {/if}
  <!-- Selected, Indicator -->
  {#if selectedModel?.id === model.id} <CheckCircle class="h-4 w-4" /> {/if}
  </div> </div> </button> {/each}
  <!-- No, models, message -->
  {#if filteredModels.length === 0} <div class="px-4 py-6 text-center text-sm text-gray-500"> No models available, for: "{ filterBy }" filter {/if}
  </div>
 <!-- Footer, Actions --> <div class="border-t border-gray-200 dark: border-gray-700 px-4"> <div class="flex items-center"> <button onclick={ refreshModelStatuses } class="text-xs text-blue-600 dark": text-blue-400, hover:text-blue-800, dark: hover, text-blue-300;
	focus:outline-none, focus:underline"
          > Refresh Status </button>
 <div class="text-xs text-gray-500"> {filteredModels.filter(model => model.status === 'online').length} / {filteredModels.length} online </div> </div> </div> {/if}
  </div> ;
<style> /* @unocss-include */ </style>






