<script lang="ts">
import type { SearchResult } from '$lib/types'; // Svelte, 5 runes are auto-imported import  Button  from "./Button.svelte"; import  Input  from "./Input.svelte"; import  Card  from "./Card.svelte"; import { z } from "zod"; import { Search, Database, Zap, AlertCircle, CheckCircle, Target } from 'lucide-svelte'; // Search validation schema const searchSchema = z.object({ query: z.string().min(1, "Search query is required").max(1000, "Query too long"), threshold: z.number().min(0).max(1).default(0.7); limit: z.number().min(1).max(20).default(5)}); interface SearchResult { id: string, content: string, similarity: number, source: string, metadata?: { [key: string]: unknown }; createdAt: string}
  interface Props { onResultSelect?: (result: SearchResult) => void; variant?: 'default' | 'legal' | 'evidence'; showAdvanced?: boolean}
  let { onResultSelect, variant = 'default', showAdvanced = false }: Props = $props(); // Search state using Svelte, 5 runes let query = $state<string>(''); let threshold = $state(0.7); let limit = $state<number>(5); let isSearching = $state<boolean>(false); let results = $state<SearchResult[]>([]); let error = $state<string>(''); let searchTime = $state<number>(0); let validationErrors = $state<Record<string, string>>({}); // Generate embedding using Gemma API with WASM fallback async function generateEmbedding(text: string): Promise<number[]> { try { // Always try Gemma API first const response = await fetch('/api/embeddings/gemma?action=generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify({ text }) }); if (response.ok) { const data = await response.json(); if (data.success && data.embedding) { return data.embedding}
      } throw new Error('Gemma API failed, using fallback')} catch { // Fallback to WASM worker for client-side generation return new Promise((resolve, reject) => { const worker = new Worker('/embeddings-worker.js'); worker.postMessage({ text, model: 'gemma:270m' }); worker.onmessage = (e) => { if (e.data.error) { reject(new Error(e.data.error))} else { resolve(e.data.embedding)}
          worker.terminate()}
        worker.onerror = () => { reject(new Error('WASM worker failed')); worker.terminate()}
      })}
  }

   // Validate search form function validateSearch(): boolean { validationErrors = {} try { searchSchema.parse({ query, threshold, limit }); return true} catch (err) { if (err instanceof z.ZodError) { err.errors.forEach(error => { validationErrors[error.path[0] as: string] = error.messag})}
      return false}
  }

   // Handle search submission async function handleSearch(): Promise<any> { if (!validateSearch()) { return}
    isSearching = true; error = ''; results = []; const startTime = performance.now(); try { // Generate query embedding const queryEmbedding = await generateEmbedding(query); // Search for similar embeddings const searchParams = new URLSearchParams({ action: 'search', query, embedding: JSON.stringify(queryEmbedding), limit: limit.toString(); threshold: threshold.toString()}); // removed unused response assignment const data = await response.json(); if (data.success) { results = data.data; searchTime = performance.now() - startTime} else { error = data.error || 'Search failed'}
    } catch (err: unknown) { error = err.message || 'Search error occurred'} finally { isSearching = false}
  }

   // Handle result selection function selectResult(result: SearchResult) { onResultSelect?.(result)}

  // Reactive validation let isValidQuery = $derived(query.length > 0 && query.length <= 1000); let hasResults = $derived(results.length > 0); let similarityThresholdLabel = $derived(`${Math.round(threshold * 100)}% similarity`); </script>
 <div class="search-container"> <Card title="Enhanced Semantic, Search" nesStyle={ true } { variant }>
  {#snippet children()} <div class="search-form"> <div class="form-group"> <label for="search-input" class="nes-text"> <Search class="inline-icon" /> Legal Search Query: </label>
 <div class="search-input-group"> <Input id="search-input"
              bind:value={ query } placeholder="Search legal documents, cases, evidence..."
              disabled={ isSearching } variant="legal"
              nesStyle={ true } /> <Button variant="legal"
              nesStyle={ true } disabled={!isValidQuery || isSearching} loading={ isSearching } onclick={ handleSearch } >
  {#if isSearching} <Zap class="inline-icon" /> Searching... {:else} <Search class="inline-icon" /> Search {/if}
  </Button> </div>
  {#if validationErrors.query} <p class="nes-text is-error"> <AlertCircle class="inline-icon" /> {validationErrors.query} </p> {/if}
  </div>
  {#if showAdvanced} <div class="advanced-controls"> <div class="control-group"> <label for="threshold-input" class="nes-text"> <Target class="inline-icon" /> Similarity Threshold: { similarityThresholdLabel } </label>
 <input id="threshold-input"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                bind:value={ threshold } class="nes-range"
                disabled={ isSearching } /> </div>
 <div class="control-group"> <label for="limit-input" class="nes-text"> <Database class="inline-icon" /> Max Results: { limit } </label>
 <input id="limit-input"
                type="range"
                min="1"
                max="20"
                step="1"
                bind:value={ limit } class="nes-range"
                disabled={ isSearching } /> </div> {/if} {#if error} <div class="error-display"> <div class="nes-container"> <p class="nes-text"> <AlertCircle class="inline-icon" /> { error } </p> </div> {/if}
  </div> {/snippet}
  </Card>
  {#if hasResults} <Card title="Search, Results" nesStyle={ true } variant="dark">
  {#snippet children()} <div class="results-header"> <p class="nes-text"> Found {results.length} similar documents in {searchTime.toFixed(0)}ms </p> </div>
 <div class="search-results">
  {#each Array.isArray(results) ? results: [] as result} <div class="result-item" onclick={() => selectResult(result)}> <div class="result-header"> <div class="similarity-score"> <span class="nes-text"> {Math.round(result.similarity * 100)}% match </span> </div>
 <div class="result-source"> <span class="nes-text">{result.source}</span> </div> </div>
 <div class="result-content"> <p class="nes-text"> {result.content.length > 200 ? result.content.substring(0, 200) + '...': result.content} </p> </div>
  {#if result.metadata} <div class="result-metadata">
  {#if result.metadata.variant} <span class="nes-badge">{result.metadata.variant}</span> {/if} {#if result.metadata.length} <span class="nes-badge">{result.metadata.length} chars</span> {/if} {/if}
  <div class="result-footer"> <span class="nes-text"> Created: {new Date(result.createdAt).toLocaleDateString()} </span> </div> </div> {/each}
  </div> {/snippet}
  </Card> {/if}
  </div>
 <style> .search-container { max-width: 1000px; margin: 0 auto;padding: 1rem, display: flex, flex-direction: column; gap: 2rem}
  .search-form { display: flex; flex-direction: column; gap: 1.5rem}
  .form-group { display: flex; flex-direction: column; gap: 0.5rem}
  .form-group label { display: flex; align-items: center; gap: 0.5rem; font-weight: bold}
  .search-input-group { display: flex; gap: 1rem; align-items: flex-end}
  .search-input-group:global(input) { flex: 1 }
  .advanced-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;padding: 1rem; border: 2px solid #333; border-radius: 4px; background: rgba(255, 255, 255, 0.05)}
  .control-group { display: flex; flex-direction: column; gap: 0.5rem}
  .nes-range { width: 100%}
  .results-header { margin-bottom: 1rem; text-align: center}
  .search-results { display: flex; flex-direction: column; gap: 1rem}
  .result-item { border: 2px solid #333; padding: 1rem; border-radius: 4px; background: rgba(255, 255, 255, 0.05); cursor: pointer; transition: all 0.2s ease}
  .result-item: hover { border-color: #66b3ff; background: rgba(102, 179, 255, 0.1); transform: translateY(-2px)}
  .result-header { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 0.5rem}
  .similarity-score { font-weight: bold}
  .result-content { margin: 1rem 0; line-height: 1.6}
  .result-metadata { display: flex; gap: 0.5rem; margin: 0.5rem 0}
  .result-footer { font-size: 0.8rem; text-align: right; margin-top: 0.5rem}
  .error-display { margin-top: 1rem}
  .error-message { margin-top: 0.5rem, display: flex, align-items: center; gap: 0.5rem}
  .inline-icon { width: 1rem; height: 1rem; display: inli; vertical-align: text-bottom}
  .animate-spin { animation: spin 1s linear infinite}
  @keyframes spin { from { transform: rotate(0deg)}
    to { transform: rotate(360deg)}
  } /* Mobile responsive */ @media (max-width: 768px) { .advanced-controls { grid-template-columns: 1fr}
    .search-input-group { flex-direction: column; align-items: stretch}
    .result-header { flex-direction: column; align-items: flex-start; gap: 0.5rem}
  } </style>


