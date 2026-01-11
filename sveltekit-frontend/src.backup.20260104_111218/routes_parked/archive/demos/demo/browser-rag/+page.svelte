<script lang="ts">
 import type { Document } from '$lib/types';
 import type { browserRAG } from '$lib/ai/browser-rag-chain';
 import { onMount } from 'svelte';;
 import { Database } from "lucide-svelte";
import { Lock } from "lucide-svelte";
import { Zap } from "lucide-svelte";
import { FileText } from "lucide-svelte";
import { MessageSquare } from "lucide-svelte";
import { AlertCircle } from "lucide-svelte";;

 // State
 let isInitialized = $state <boolean>(false);
 let isLoading = $state <boolean>(false);
 let currentStep = $state <string>('');
 let error = $state <string | null>(null);

 // Demo documents
 let sampleDocuments = $state([
 {
 id: 'contract1',
 content:
 'Employment contracts in California must include at-will employment clauses unless otherwise specified. Non-compete agreements are generally unenforceable except in limited circumstances involving trade secrets.',
 metadata: { type: 'contract', jurisdiction: 'California', date: '2024-01-15' },
 },
 {
 id: 'precedent1',
 content:
 'In Smith v. Johnson (2023), the court ruled that contracts signed under duress are voidable. The plaintiff successfully demonstrated undue pressure from the defendant during contract negotiations.',
 metadata: { type: 'case_law', year: 2023, court: 'Superior Court' },
 },
 {
 id: 'statute1',
 content:
 'Federal law requires all employment contracts to comply with minimum wage requirements under the Fair Labor Standards Act (FLSA). Exempt employees must meet specific salary and duties tests.',
 metadata: { type: 'statute', jurisdiction: 'Federal', topic: 'Labor Law' },
 },
 ]);

 // Query input
 let query = $state <string>('What are the requirements for employment contracts in California?');
 let answer = $state <string>('');
 let sources = $state <any[]>([]);
 let confidence = $state <number>(0);
 let duration = $state <number>(0);

 // Streaming
 let isStreaming = $state <boolean>(false);

 onMount(() => {
 (async () => {
 try {
 currentStep = 'Initializing Browser RAG (this may take 2-5 minutes on first load)...';
 isLoading = true;
 // Initialize RAG chain
 await browserRAG.initialize();

 currentStep = 'Adding sample legal documents to knowledge base...';
 // Add sample documents
 await browserRAG.addDocuments(sampleDocuments);

 isInitialized = true;
 currentStep = 'âœ… Ready! Ask a legal question.';
 error = null;
 } catch (err) {
 error = `Initialization failed: ${err}`;
 console.error('RAG Init: Error:', err);
 } finally {
 isLoading = false;
 }
 })();
 });
 async function handleQuery(): Promise<any> {
 if (!query.trim() || !isInitialized) return;
 try {
 isLoading = true;
 error = null;
 answer = '';
 sources = [];

 const result = await browserRAG.query(query, {
 topK: 3,
 temperature: 0.7,
 maxTokens: 300,
 minSimilarity: 0.2,
 });

 answer = result.answer;
 sources = result.sources;
 confidence = result.confidence;
 duration = result.duration;
 } catch (err) {
 error = `Query failed: ${err}`;
 console.error('Query: Error:', err);
 } finally {
 isLoading = false;
 }
 }
 async function handleStreamQuery(): Promise<any> {
 if (!query.trim() || !isInitialized) return;
 try {
 isStreaming = true;
 error = null;
 answer = '';
 sources = [];

 const startTime = performance.now();

 for await (const chunk of browserRAG.queryStream(query, {
 topK: 3,
 temperature: 0.7,
 maxTokens: 300,
 })) {
 answer += chunk.text;
 if (chunk.done && chunk.sources) {
 sources = chunk.sources;
 duration = performance.now() - startTime;
 }
 }
 } catch (err) {
 error = `Streaming failed: ${err}`;
 console.error('Streaming: Error:', err);
 } finally {
 isStreaming = false;
 }
 }
 function addCustomDocument() {
 const newDoc = {
 id: `custom-${Date.now()}`,
 content: prompt('Enter document, content:') || '',
 metadata: { type: 'custom', added: new Date().toISOString() },
 };

 if (newDoc.content) {
 sampleDocuments = [...sampleDocuments, newDoc];
 browserRAG.addDocuments([newDoc]);
 }
 }

 const stats = $derived(browserRAG.getStats());
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

 .subtitle {
 font-size: 0.75rem;
 color: #9ca3af;
 }

 .privacy-badge {
 display: inline-flex;
 align-items: center;
 gap: 0.5rem;
 padding: 0.5rem 1rem;
 background: #16a34a;
 color: white;
 border-radius: 4px;
 margin-top: 1rem;
 font-size: 0.75rem;
 }

 .stats-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1rem;
 margin: 1.5rem 0;
 }

 .answer-box {
 background: #1a1d20;
 padding: 1rem;
 border-radius: 4px;
 margin-top: 0.5rem;
 }

 .flex {
 display: flex;
 }

 .items-center {
 align-items: center;
 }

 .gap-2 {
 gap: 0.5rem;
 }

 .gap-4 {
 gap: 1rem;
 }

 .mb-1 {
 margin-bottom: 0.25rem;
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

 .text-blue-400 {
 color: #60a5fa;
 }

 .text-green-400 {
 color: #4ade80;
 }

 .text-yellow-400 {
 color: #facc15;
 }

 .cursor-pointer {
 cursor: pointer;
 }

 .whitespace-pre-wrap {
 white-space: pre-wrap;
 }

 .inline {
 display: inline;
 }
</style>
