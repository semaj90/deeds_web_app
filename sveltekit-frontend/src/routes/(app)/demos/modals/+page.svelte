<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import ModalAlt from '$lib/components/ui/modal/Modal.svelte';

	let modal1Open = $state(false);
	let modal2Open = $state(false);
	let modal3Open = $state(false);

</script>

<div class="p-6 max-w-2xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Modal Components</h1>
		<p class="text-sm opacity-60">Two modal implementations: ui/Modal (226L) with gradient backdrop and keyboard handling, plus modal/Modal (174L) with transitions and size variants.</p>
	</header>

	<div class="flex gap-3 flex-wrap">
		<button class="px-4 py-2 rounded border border-sand/30 hover:border-sand/50 text-sm" onclick={() => modal1Open = true}>
			Open Modal (226L)
		</button>
		<button class="px-4 py-2 rounded border border-info/30 hover:border-info/50 text-sm" onclick={() => modal2Open = true}>
			Open Modal Alt (174L)
		</button>
		<button class="px-4 py-2 rounded border border-accent/30 hover:border-accent/50 text-sm" onclick={() => modal3Open = true}>
			Open Large Modal
		</button>
	</div>

	<Modal bind:open={modal1Open} title="ui/Modal Demo" size="md">
		<p class="text-sm">This is the <strong>ui/Modal.svelte</strong> (226L) — features gradient backdrop, escape key handling, outside-click close, and size variants (sm/md/lg/xl).</p>
		{#snippet footer()}
			<div class="flex justify-end gap-2">
				<button class="px-3 py-1.5 rounded border border-sand/30 text-sm" onclick={() => modal1Open = false}>Close</button>
			</div>
		{/snippet}
	</Modal>

	<ModalAlt bind:open={modal2Open} title="modal/Modal Demo" description="Alternative modal implementation" size="md">
		<p class="text-sm">This is the <strong>ui/modal/Modal.svelte</strong> (174L) — features Svelte transitions (fade + scale), close button, overlay click, and 5 size variants (sm/md/lg/xl/full).</p>
		{#snippet footer()}
			<div class="flex justify-end gap-2">
				<button class="px-3 py-1.5 rounded border border-sand/30 text-sm" onclick={() => modal2Open = false}>Close</button>
			</div>
		{/snippet}
	</ModalAlt>

	<ModalAlt bind:open={modal3Open} title="Large Modal" size="lg">
		<p class="text-sm mb-4">Large size variant demonstration.</p>
		<div class="grid grid-cols-2 gap-4">
			<div class="p-3 rounded border border-sand/20">
				<h3 class="text-sm font-bold mb-1">Section A</h3>
				<p class="text-xs opacity-60">Content area for larger layouts.</p>
			</div>
			<div class="p-3 rounded border border-sand/20">
				<h3 class="text-sm font-bold mb-1">Section B</h3>
				<p class="text-xs opacity-60">Side-by-side content in large modal.</p>
			</div>
		</div>
	</ModalAlt>
</div>
