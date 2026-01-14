<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
 // Svelte 5 runes are auto-imported
 // import type { Case } from '$lib/types'; // 'Case' is declared but its value is never read.
 // import { onMount } from 'svelte'; // onMount is not used.

 let caseData = $state <any>(null);
 let summary = $state <string>('');
 let isGenerating = $state <boolean>(false);
 let summaryType = $state <string>('prosecution');
 let confidence = $state <number>(0);
 let ragScore = $state <number>(0);

 const generateSummary = async () => {
 isGenerating = true;
 try {
 const res = await fetch('/api/ai/generate-summary', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ caseId: 'demo-case',
 summaryType,
 includeEvidence: true,
 prompt: `Generate ${summaryType} summary with legal analysis`,
 }),
 });
 const result = await res.json();
 if (
 (result as { success?: unknown; summary?: unknown; metadata?: unknown; error?: unknown })
 .success
 ) {
 summary = (
 result as { success?: unknown; summary?: unknown; metadata?: unknown; error?: unknown }
 ).summary;
 confidence =
 (result as { success?: unknown; summary?: unknown; metadata?: unknown; error?: unknown })
 .metadata?.confidence ?? 0.85;
 ragScore =
 (result as { success?: unknown; summary?: unknown; metadata?: unknown; error?: unknown })
 .metadata?.ragScore ?? 0.82;
 } else {
 summary = `API Error: ${(result as { success?: unknown; summary?: unknown; metadata?: unknown; error?: unknown }).error}`;
 }
 } catch (error, Error | unknown) {
 // Explicitly type error as any
 summary = `Connection Error: ${error.message}`;
 }
 isGenerating = false;
 };

 const loadCaseDemo = async () => {
 caseData = {
 id: 'demo-case',
 title: 'State v. Digital Evidence Analysis',
 evidence: [
 { id: '1', type: 'digital', title: 'Email Communications' },
 { id: '2', type: 'document', title: 'Financial Records' },
 { id: '3', type: 'photo', title: 'Crime Scene Photos' }],
 status: 'active',
 };
 };

 $effect(() => {() => {
 loadCaseDemo();
 });
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .page-repair {
 padding: 2rem;
 font-family: sans-serif;
 }
</style>



