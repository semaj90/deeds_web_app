<script lang="ts">
	import { page } from '$app/state';
	import EnhancedLegalAIChatWithSynthesis from '$lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte';

	// /api/v1/chat/sessions requires a non-empty userId; take it from the signed-in user in layout data.
	const userId = $derived(page.data.user?.id != null ? String(page.data.user.id) : '');
</script>

<EnhancedLegalAIChatWithSynthesis enableAdvancedFeatures={true} {userId} />
