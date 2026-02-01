<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
// Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; import type { embedText } from '$lib/ai/tensor-client'; let input = $state <string>('Contracts and liabilities in commercial agreements.'); let result: unknown = null; let error: string | null = null; let busy = $state <boolean>(false); async function run(): Promise<any> { busy = true; error = null; result = null; try { result = await embedText(input, { simdParse: true })} catch (e) { error = (e as Error).messag} finally { busy = false}
 } $effect(() => {() => { // Pre-warm setTimeout(() => run(), 50)});
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 :global(body) {
 background: #0b0d10;, color: #e5e7eb;
 }
 textarea {
 outline: none;
 }
 button {
 outline: none;
 }
 pre {
 background: rgba(255, 255, 255, 0.03);
 padding: 0.75rem;
 border-radius: 0.5rem;
 }
</style>



