<script lang="ts">
	import { page } from '$app/state';
	import CaseChatPanel from '$lib/components/legal-ai/CaseChatPanel.svelte';

	let caseId = $derived(page.params.id);
</script>

<div class="case-chat-wrapper">
	<CaseChatPanel {caseId} />
</div>

<style>
	.case-chat-wrapper {
		display: flex;
		flex-direction: column;
		/* Fill all available space from the parent <main> in the cases layout */
		height: calc(100vh - 10rem);
		min-height: 400px;
		max-height: calc(100vh - 8rem);
	}

	@media (max-width: 768px) {
		.case-chat-wrapper {
			height: calc(100vh - 7rem);
			min-height: 300px;
		}
	}
</style>