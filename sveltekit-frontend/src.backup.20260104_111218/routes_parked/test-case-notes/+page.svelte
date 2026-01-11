<script lang="ts">
 import CaseNotesEditor from '$lib/components/cases/CaseNotesEditor.svelte';
</script>

<main class="test-case-notes-page">
 <h1>Case Notes Editor Test</h1>
 <p>This page demonstrates the production-ready CaseNotesEditor component with autosave, sorting, and Svelte 5 compatibility.</p>

 <CaseNotesEditor
 caseId="test-case-123"
 onClose={() => console.log('Close clicked')}
 />
</main>

<style>
 .test-case-notes-page {
 padding: 2rem;
 max-width: 1200px;
 margin: 0 auto;
 }

 h1 {
 color: var(--yorha-text-primary, #e0e0e0);
 margin-bottom: 1rem;
 }

 p {
 color: var(--yorha-text-secondary, #a0a0a0);
 margin-bottom: 2rem;
 }
</style>
