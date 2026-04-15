<script lang="ts">
	import HoverCard from '$lib/components/ui/HoverCard.svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import LoadingSpinner from '$lib/components/subcomponents/LoadingSpinner.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let checked1 = $state(false);
	let checked2 = $state(true);

</script>

<div class="p-6 max-w-2xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">UI Primitives</h1>
		<p class="text-sm opacity-60">HoverCard with progressive disclosure, Checkbox with accessible ID generation, and LoadingSpinner with size/color variants.</p>
	</header>

	<h2 class="text-sm font-bold mb-3 opacity-70">HoverCard (80L)</h2>
	<div class="mb-6">
		<HoverCard>
			{#snippet trigger()}
				<span class="underline cursor-pointer">Hover over me for details</span>
			{/snippet}
			<div class="p-3 text-sm">
				<p class="font-bold">Fiduciary Duty</p>
				<p class="opacity-70">A legal obligation of one party to act in the best interest of another.</p>
			</div>
		</HoverCard>
	</div>

	<h2 class="text-sm font-bold mb-3 opacity-70">Checkbox (72L)</h2>
	<div class="flex gap-6 mb-6">
		<Checkbox bind:checked={checked1} label="Enable AI analysis" />
		<Checkbox bind:checked={checked2} label="Show confidence scores" />
	</div>

	<h2 class="text-sm font-bold mb-3 opacity-70">LoadingSpinner (66L)</h2>
	<div class="flex items-center gap-6">
		<LoadingSpinner size="sm" />
		<LoadingSpinner size="md" />
		<LoadingSpinner size="lg" />
	</div>
</div>
