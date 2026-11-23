<script lang="ts">
	import SceneVideoEventBindings from '$lib/components/evidence/SceneVideoEventBindings.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Scene video event readback fixture</title></svelte:head>

<main class="mx-auto max-w-3xl p-6">
	<h1>Scene event readback fixture</h1>
	<SceneVideoEventBindings caseId={data.caseId} bindings={[data.binding]} groundPlaneTrackProposals={data.groundPlaneTrackProposals} />
</main>
