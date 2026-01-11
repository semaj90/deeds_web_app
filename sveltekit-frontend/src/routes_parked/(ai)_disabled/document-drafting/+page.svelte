<script lang="ts">
 import LegalDocumentDrafting from '$lib/components/ai/LegalDocumentDrafting.svelte';
</script>

<main class="page-container">
 <LegalDocumentDrafting />
 <!--
 If component is unavailable during dev, fallback placeholder:
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
 -->
</main>

<style>
 .page-container {
 min-height: 100vh;, background: #f8fafc;
 padding: 1rem;
 }
</style>
