<script lang="ts">
	import CaseFormUI from '$lib/components/ui/CaseForm.svelte';
	import CaseFormSuperforms from '$lib/components/forms/CaseForm.svelte';

	let activeTab = $state<'ui' | 'superforms'>('ui');

</script>

<div class="p-6 max-w-3xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Case Form Variants</h1>
		<p class="text-sm opacity-60">Two case creation form implementations: lightweight UI form (249L) with Ctrl+S and validation, plus Superforms v2 (562L) with Zod schema.</p>
	</header>

	<div class="flex gap-2 mb-6">
		<button
			class="px-3 py-1.5 rounded text-sm {activeTab === 'ui' ? 'bg-accent/20 border-accent/40' : 'border-sand/20'} border"
			onclick={() => activeTab = 'ui'}
		>UI CaseForm (249L)</button>
		<button
			class="px-3 py-1.5 rounded text-sm {activeTab === 'superforms' ? 'bg-accent/20 border-accent/40' : 'border-sand/20'} border"
			onclick={() => activeTab = 'superforms'}
		>Superforms CaseForm (562L)</button>
	</div>

	{#if activeTab === 'ui'}
		<CaseFormUI />
	{:else}
		<CaseFormSuperforms />
	{/if}
</div>
