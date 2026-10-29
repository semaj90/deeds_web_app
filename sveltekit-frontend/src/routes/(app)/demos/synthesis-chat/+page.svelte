<script lang="ts">
	import type { PageData } from './$types';
	import EnhancedLegalAIChatWithSynthesis from '$lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte';

	let { data } = $props<{ data: PageData }>();

	// /api/v1/chat/sessions requires a non-empty userId; take it from the signed-in user in layout data.
	const userId = $derived(data.user?.id != null ? String(data.user.id) : '');
</script>

<EnhancedLegalAIChatWithSynthesis enableAdvancedFeatures={true} {userId} />
