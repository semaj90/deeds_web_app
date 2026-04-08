<script lang="ts">
	import EvidenceForm from '$lib/components/forms/EvidenceForm.svelte';

	export const ssr = false;
</script>

<div class="p-6 max-w-2xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Evidence Form</h1>
		<p class="text-sm opacity-60">Evidence submission form with Superforms v2, field validation, and automatic navigation on success.</p>
	</header>

	<EvidenceForm />
</div>
