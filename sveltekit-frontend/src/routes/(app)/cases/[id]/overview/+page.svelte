<script lang="ts">
	import type { PageData } from './$types';
	import CaseOverview from '$lib/components/cases/CaseOverview.svelte';

	let { data } = $props<{ data: PageData }>();
</script>

<div class="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col">
	<CaseOverview {data} isModal={false} />
</div>
