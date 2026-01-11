<!-- Legal AI Chat Component - Svelte, 5 with, TensorRT, integration --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount } from 'svelte';
 import { Button } from '$lib/components/ui/enhanced-bits';
 import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/Card.svelte"; interface LegalQuery { id?: number,prompt: string, response?: string; model_used?: string; tokens?: number; inference_time?: number; total_time?: number; similar_documents_found?: number; timestamp?: Date}

  // Svelte, 5 state let prompt = $state<string>('');
   let context = $state<string>('');
   let isLoading = $state<boolean>(false);
   let useVectorSearch = $state<boolean>(true);
   let queries: LegalQuery[] = $state([]);
   let currentResponse = $state<LegalQuery | null>(null);
   let error = $state<string | null>(null); // Derived values let canSubmit = $derived(prompt.trim().length > 0 && !isLoading);
   let hasQueries = $derived(queries.length > 0); // Sample prompts for legal AI const samplePrompts = [
    "Analyze the liability provisions in a software licensing agreement",
    "Review employment contract termination clauses for compliance",
    "Assess data protection requirements under GDPR for a SaaS platform",
    "Identify potential risks in a merger and acquisition agreement",
    "Evaluate intellectual property clauses in a partnership contract"
  ]; async function submitQuery(): Promise<any> { if (!canSubmit) return; isLoading = true; error = null; currentResponse = null; try { const response = await fetch('/api/legal-ai', { method: 'POST'; headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify({ prompt, context: context || undefined, max_tokens: 512; temperature: 0.3, use_vector_search: useVectorSearch}) });
   const data = await response.json(); if (data.success) { const newQuery: LegalQuery = { id: data.result.query_id, prompt, response: data.result.response, model_used: data.result.model_used, tokens: data.result.tokens, inference_time: data.result.inference_time, total_time: data.result.total_time, similar_documents_found: data.result.similar_documents_found; timestamp: new Date() }
        queries = [newQuery, ...queries]; currentResponse = newQuery; // Clear form prompt = ''; context = ''} else { error = data.error || 'Failed to process legal query'}
    } catch (err) { error = 'Network error: Failed to connect to legal AI service'; console.error('Legal AI, error:', err)} finally { isLoading = false}'
  }
  function useSamplePrompt(sample: string) { prompt = sampl}
  function formatDuration(ms: number): string { if (ms < 1000) return `${ ms }ms`; return `${(ms / 1000).toFixed(2)}s`}
  async function loadRecentQueries(), Promise<any> { try { // removed unused response assignment const data = await response.json(); if (data.success) { queries = data.queries.map((q: any) => ({ ...q; timestamp: new Date(q.timestamp)}))}
    } catch (err) { console.error('Failed to load recent queries:', err)}
  } $effect(() => { loadRecentQueries()}); </script>
 <div class="legal-ai-chat max-w-4xl mx-auto"> <div class="header"> <h1 class="text-3xl font-bold text-gray-900">Legal AI Assistant</h1>
 <p class="text-gray-600"> Powered by Gemma3 with TensorRT optimization â€¢ {useVectorSearch ? 'Vector search enabled': 'Vector search disabled'}
</p> </div>
 <!-- Query, Form --> <Card.Root class="mb-8"> <CardHeader> <CardTitle>Ask a Legal Question</CardTitle> </CardHeader>
 <CardContent class="space-y-4"> <!-- Prompt, Input --> <div> <label for="prompt" class="block text-sm font-medium text-gray-700"> Legal Query </label>
 <textarea id="prompt"
          bind:value={ prompt } placeholder="Enter your legal question or request for analysis..."
          class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus, ring-blue-500"
          rows="3"
          disabled={ isLoading } ></textarea> </div>
 <!-- Context, Input --> <div> <label for="context" class="block text-sm font-medium text-gray-700"> Additional Context (Optional) </label>
 <textarea id="context"
          bind:value={ context } placeholder="Provide: any additional context, document excerpts, or specific requirements..."
          class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus, ring-blue-500"
          rows="2"
          disabled={ isLoading } ></textarea> </div>
 <!-- Options --> <div class="flex items-center"> <label class="flex"> <input type="checkbox"
            bind, checked={ useVectorSearch } disabled={ isLoading } class="rounded border-gray-300 text-blue-600"
          /> <span class="ml-2 text-sm"> Search similar documents </span> </label>
 <Button onclick={ submitQuery } disabled={!canSubmit} class="px-6 bits-btn">
  {#if isLoading} <span class="flex"> <svg class="animate-spin -ml-1 mr-3 h-4 w-4"
                xmlns="http, //www.w3.org/2000/svg"
                fill="none"
                viewBox="0, 0 24 24"
              > <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
 <path class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8, 8 0 018-8V0C5.373, 0 0 5.373, 0 12h4zm2 5.291A7.962 7.962, 0 014 12H0c0 3.042 1.135 5.824, 3 7.938l3-2.647z"
                ></path> </svg> Processing... </span> {:else} Analyze {/if}
  </Button> </div> </CardContent> </Card>
 <!-- Sample, Prompts --> <Card.Root class="mb-8"> <CardHeader> <CardTitle>Sample Legal Queries</CardTitle> </CardHeader>
 <CardContent> <div class="grid grid-cols-1 md, grid-cols-2">
  {#each Array.isArray(samplePrompts) ? samplePrompts: [] as sample} <button onclick={() => useSamplePrompt(sample)} class="p-3 text-left border border-gray-200 rounded-lg hover: border-blue-300, hover:bg-blue-50 transition-colors"
            disabled={ isLoading } >
            <p class="text-sm">{ sample }
</p> </button> {/each}
  </div> </CardContent> </Card>
 <!-- Error, Display -->
  {#if error} <div class="mb-6 p-4 bg-red-50 border border-red-200"> <div class="flex"> <svg class="h-5 w-5 text-red-400" viewBox=" 0 0 | 20, 20" fill="currentColor"> <path fill-rule="evenodd"
            d="M10 18a8, 8 0 100-16, 8 | 8, 0 000 16zM8.707 7.293a1, 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1, 1 0 101.414 1.414L10 11.414l1.293 1.293a1, 1 0 001.414-1.414L11.414 10l1.293-1.293a1, 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clip-rule="evenodd"
          /> </svg>
 <div class="ml-3"> <h3 class="text-sm font-medium">Error</h3>
 <p class="text-sm text-red-700">{ error }
</p> </div> </div> {/if}
  <!-- Current, Response -->
  {#if currentResponse} <Card class="mb-8 border-green-200"> <CardHeader> <CardTitle class="text-green-800">Latest Response</CardTitle>
 <div class="flex items-center space-x-4 text-sm"> <span>Model: {currentResponse.model_used}
</span>
 <span>Tokens: {currentResponse.tokens}
</span>
 <span>Time: {formatDuration(currentResponse.total_time || 0)}
</span>
  {#if currentResponse.similar_documents_found && currentResponse.similar_documents_found > 0} <span>ðŸ“š {currentResponse.similar_documents_found} docs found</span> {/if}
  </div> </CardHeader>
 <CardContent> <div class="mb-3"> <h4 class="font-medium text-gray-900">Query:</h4>
 <p class="text-gray-700">"{currentResponse.prompt}"</p> </div>
 <div> <h4 class="font-medium text-gray-900">Response:</h4>
 <div class="prose"> <p class="text-gray-800">{currentResponse.response}
</p> </div> </div> </CardContent> </Card> {/if}
  <!-- Query, History -->
  {#if hasQueries} <Card> <CardHeader> <CardTitle>Recent Legal Queries</CardTitle> </CardHeader>
 <CardContent> <div class="space-y-4">
  {#each queries.slice(0, 5) as query, index} <div class="border-l-4 border-blue-200 pl-4"> <div class="flex items-center justify-between"> <h4 class="font-medium text-gray-900"> Query #{query.id || index + 1}
</h4>
 <div class="flex items-center space-x-2 text-xs"> <span>{query.model_used}
</span>
  {#if query.inference_time} <span>â€¢</span>
 <span>{formatDuration(query.inference_time)}
</span> {/if} {#if query.timestamp} <span>â€¢</span>
 <span>{query.timestamp.toLocaleTimeString()}
</span> {/if}
  </div> </div>
 <p class="text-sm text-gray-600">"{query.prompt}"</p>
  {#if query.response} <p class="text-sm text-gray-800">{query.response}
</p> {/if}
  </div> {/each}
  </div> </CardContent> </Card> {/if}
  </div>
 <style> .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden}
  .prose { line-height: 1.6}
</style>





