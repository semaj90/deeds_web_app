<script lang="ts">
	import EvidenceTheoryBoard from '$lib/components/detective/EvidenceTheoryBoard.svelte';
</script>

<div class="p-4" style="height: calc(100vh - 4rem);">
	<header class="mb-4">
		<h1 class="text-xl font-bold mb-1">Evidence Theory Board</h1>
		<p class="text-sm opacity-60">Detective-style drag-connect evidence board with confidence bubbles, theory hypotheses, and connection strength lines.</p>
	</header>
	<EvidenceTheoryBoard />
</div>
