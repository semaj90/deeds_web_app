<script lang="ts">
import type { Button } from '$lib/components/ui/button';
 // Svelte, 5 runes are auto-imported
 import type { page } from '$app/stores';
 import VisualEvidenceEditor from '$lib/components/evidence-editor/VisualEvidenceEditor.svelte';
 import UiButton as Button from "$lib/components/ui.svelte";
 import { onMount } from 'svelte';
 let caseId: string | null = null
 let readOnly = $state <boolean>(false);
 $effect (() => {
 // Get case ID from URL params if provided
 caseId = $page .url.searchParams.get('caseId');
 readOnly = $page .url.searchParams.get('readOnly') === 'true'});
 function toggleReadOnly() {
 readOnly = !readOnly}
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 /* @unocss-include */
 .evidence-editor-page {
 height: 100vh; overflow: hidden;
 }
</style>



