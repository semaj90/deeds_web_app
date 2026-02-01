<script lang="ts">
 import { page } from '$app/state';
 import CaseChatPanel from '$lib/components/legal-ai/CaseChatPanel.svelte';
 import LegalAILayout from '$lib/components/legal-ai/LegalAILayout.svelte';

 let caseId = $derived(page.params.id);
</script>

<LegalAILayout title="Case Analysis" subtitle="Chat with AI Legal Assistant about this case">
 <div class="case-chat-container">
 <CaseChatPanel />
 </div>
</LegalAILayout>

<style>
 .case-chat-container {
 display: grid;
 grid-template-columns: 1fr;
	gap: 1.5rem;
 height: calc(100vh - 200px);
 }

 @media (max-width: 768px) {
 .case-chat-container {
 height: auto;
 }
 }
</style>
