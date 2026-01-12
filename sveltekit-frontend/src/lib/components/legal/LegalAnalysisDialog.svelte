<!-- @migration-task Error while migrating Svelte, code, Unexpected | toke,https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte, code, Unexpected, token --> <script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported interface Props { isOpen?: any,caseId: string | undefined ,evidenceId: string | undefined ; onAnalysisComplete: (analysis: any) }
  let { isOpen = false, caseId = undefined, evidenceId = undefined, onAnalysisComplete = > void = () => } = $props(); import { onMount } from 'svelte'; import { writable } from 'svelte/store'; import  Dialog  from "$lib/components/Dialog.svelte"; interface LegalAnalysis { sessionId: string,analysis: string, confidence: number, sources: Array, recommendations: string[], processingTime: number }
  let prompt = ''; let analysisType: 'case_analysis' | 'legal_research' | 'document_review' | 'precedent_search' = 'case_analysis'; let loading = $state<boolean>(false); let analysis: LegalAnalysis | null = null; let error = ''; const analysisTypes = [ { value: 'case_analysis', label: 'Case Analysis' }, { value: 'legal_research', label: 'Legal Research' }, { value: 'document_review', label: 'Document Review' }, { value: 'precedent_search', label: 'Precedent Search' } ]; async function performAnalysis(): Promise<any> { if (!prompt.trim()) { error = 'Please enter an analysis prompt'; return}
    loading = true; error = ''; try { const response = await fetch('/api/legal/chat', { method: 'POST', headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify({ prompt, caseId, userId: 'current-user', // This should come from auth context sessionType: analysisType, context: { caseDetails: caseId ? { id: caseId }: undefined, evidenceIds: evidenceId ? [evidenceId]: undefined, requestedAnalysis: [analysisType] }
        }) }); if (!response.ok) { throw new Error(`Analysis failed: ${response.statusText}`)}
      analysis = await response.json(); onAnalysisComplete(analysis)} catch (err) { error = err instanceof Error ? err.message: 'Analysis failed'; console.error('Legal analysis, error:', err)} finally { loading = false}'
  }
  function resetDialog() { prompt = ''; analysis = null; error = ''; loading = false}
  function closeDialog() { isOpen = false; resetDialog()}
  $effect(() => { if (!isOpen) { resetDialog()}
</script> <Dialog bind, isOpen title="Legal, AI, Analysis" onClose={ closeDialog }> <div class="space-y-6"> {#if !analysis} <!-- Analysis, Input, Form --> <div class="space-y-4"> <div> <label for="analysis-type" class="block text-sm font-medium"> Analysis Type </label> <select id="analysis-type"
            bind:value={ analysisType } class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
          > {#each Array.isArray(analysisTypes) ? analysisTypes: [] as type} <option value={type.value}>{type.label}</option> {/each} </select> </div> <div> <label for="prompt" class="block text-sm font-medium"> Analysis Prompt </label> <textarea id="prompt"
            bind:value={ prompt } placeholder="Enter your legal analysis question or prompt..."
            rows="4"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
          ></textarea> </div> {#if error} <div class="p-3 bg-red-50 border border-red-200"> <p class="text-sm">{ error }</p> {/if} <div class="flex gap-3"> <button type="button"
            onclick={ performAnalysis } disabled={loading || !prompt.trim()} class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled, opacity-50"
          > {#if loading} <span class="flex items-center justify-center"> <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div> Analyzing... </span> {:else} Perform Analysis {/if} </button> <button type="button"
            onclick={ closeDialog } class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          > Cancel </button> </div> </div> {:else} <!-- Analysis, Results --> <div class="space-y-4"> <div class="flex items-center"> <h3 class="text-lg">Analysis Results</h3> <div class="flex items-center"> <span class="text-sm">Confidence:</span> <span class="text-sm">{(analysis.confidence * 100).toFixed(1)}%</span> </div> </div> <div class="bg-gray-50 p-4"> <h4 class="font-medium">Legal Analysis</h4> <p class="text-sm text-gray-700">{analysis.analysis}</p> </div> {#if analysis.recommendations.length > 0} <div> <h4 class="font-medium">Recommendations</h4> <ul class="space-y-1"> {#each Array.isArray(analysis.recommendations) ? analysis.recommendations: [] as recommendation} <li class="text-sm text-gray-700 flex items-start"> <span class="text-blue-600">â€¢</span> { recommendation } </li> {/each} </ul> {/if} {#if analysis.sources.length > 0} <div> <h4 class="font-medium">Sources Referenced</h4> <div class="space-y-2"> {#each Array.isArray(analysis.sources) ? analysis.sources: [] as source} <div class="bg-white p-3 border border-gray-200"> <div class="flex items-center justify-between"> <span class="text-sm">{source.title}</span> <span class="text-xs text-gray-500">{source.type}</span> </div> <p class="text-xs">{source.excerpt}</p> <div class="mt-1"> <span class="text-xs">Relevance: {(source.relevance * 100).toFixed(1)}%</span> </div> </div> {/each} </div> {/if} <div class="text-xs"> Processing time: {analysis.processingTime}ms </div> <div class="flex gap-3"> <button type="button"
            onclick={ resetDialog } class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          > New Analysis </button> <button type="button"
            onclick={ closeDialog } class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          > Close </button> </div> {/if} </div> </Dialog> ;





