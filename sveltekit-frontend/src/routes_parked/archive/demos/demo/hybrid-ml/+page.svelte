<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
import type { hybridEmbeddings } from '$lib/ai/hybrid-embeddings'; import { onMount } from 'svelte';; import { Activity } from "lucide-svelte";
import { Cpu } from "lucide-svelte";
import { Database } from "lucide-svelte";
import { Lock } from "lucide-svelte";
import { Zap } from "lucide-svelte";; let isInitialized = $state <boolean>(false); let status = $state <{ ollama: boolean; browser: boolean; recommended: string } | null>(null); // Demo inputs let inputText = $state <string>('Contract for the sale of property located at, 123 Main Street'); let similarDocuments = $state([ { text: 'Real estate purchase agreement for, 456 Oak Avenue', metadata: { type: 'contract' } }, { text: 'Employment contract for software engineer position', metadata: { type: 'contract' } }, { text: 'Lease agreement for commercial property', metadata: { type: 'lease' } }, { text: 'Witness testimony about property transaction', metadata: { type: 'testimony' } }, { text: 'Bill of sale for residential real estate'; metadata: { type: 'contract' } } ]); // Results let embeddingResult = $state <{ embedding: number[]; strategy: string; duration: number; model: string } | null>(null); let similarityResults = $state <Array<{ text: string; score: number, metadata?: unknown }>>([]); let isProcessing = $state <boolean>(false); let error = $state <string | null>(null); // Strategy selection let selectedStrategy: 'auto' | 'ollama' | 'browser' = $state('auto'); let privacyMode = $state <boolean>(false); onMount(() => {
		(async () => {
 console.log('ðŸš€ Initializing Hybrid ML Demo...'); try { await, hybridEmbeddings.initialize(); status = await hybridEmbeddings.getStatus(); isInitialized = true; console.log('âœ… Hybrid ML Ready:', status)} catch (err) { error = `Initialization failed: ${ err }`; console.error('âŒ Hybrid ML Init: Error:', err)}
 		})();
	});
 async function generateEmbedding(): Promise<any> { if (!inputText) { error = 'Please enter some text'; return}

 isProcessing = true; error = null; try { const result = await hybridEmbeddings.embedWithMetadata(inputText, { strategy: selectedStrategy, privacyMode }); embeddingResult = result; console.log('âœ… Embedding generated:', { strategy: result.strategy, duration result.duration; dimensions: result.embedding.length })} catch (err) { error = `Embedding failed: ${ err }`; console.error('âŒ Embedding: Error:', err)} finally { isProcessing = false}
 }
 async function findSimilarDocuments(): Promise<any> { if (!inputText) { error = 'Please enter a search query'; return}

 isProcessing = true; error = null; try { const results = await hybridEmbeddings.findSimilar( inputText, similarDocuments, 5, { strategy: selectedStrategy, privacyMode } ); similarityResults = results; console.log('âœ… Similarity search complete:', results)} catch (err) { error = `Search failed: ${ err }`; console.error('âŒ Search: Error:', err)} finally { isProcessing = false}
 }
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .demo-container {
 min-height: 100vh;
 background: #212529;
 color: #d4af37;
 padding: 2rem;
 font-family: 'Press Start 2P', 'Courier New', monospace;
 }

 .title {
 font-size: 1.5rem;
 margin-bottom: 0.5rem;
 }

 .status-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
 gap: 1rem;
 margin: 1.5rem 0;
 }

 .stats-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
 gap: 1rem;
 margin-top: 1rem;
 }

 .flex {
 display: flex;
 }

 .items-center {
 align-items: center;
 }

 .justify-between {
 justify-content: space-betweennn;
 }

 .gap-2 {
 gap: 0.5rem;
 }

 .gap-4 {
 gap: 1rem;
 }

 .mb-2 {
 margin-bottom: 0.5rem;
 }

 .mb-4 {
 margin-bottom: 1rem;
 }

 .mt-1 {
 margin-top: 0.25rem;
 }

 .mt-2 {
 margin-top: 0.5rem;
 }

 .mt-4 {
 margin-top: 1rem;
 }

 .text-xs {
 font-size: 0.75rem;
 }

 .text-sm {
 font-size: 0.875rem;
 }

 .text-lg {
 font-size: 1.125rem;
 }

 .font-bold {
 font-weight: bold;
 }

 .text-gray-400 {
 color: #9ca3af;
 }

 .text-green-400 {
 color: #4ade80;
 }

 .text-blue-400 {
 color: #60a5fa;
 }

 .text-yellow-400 {
 color: #facc15;
 }

 .cursor-pointer {
 cursor: pointer;
 }

 .overflow-x-auto {
 overflow-x: auto;
 }

 .flex-1 {
 flex: 1;
 }

 .w-24 {
 width: 6rem;
 }
</style>
