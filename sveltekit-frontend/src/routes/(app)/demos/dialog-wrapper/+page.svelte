<script lang="ts">
	import DialogWrapper from '$lib/components/ui/DialogWrapper.svelte';
	import AIDialog from '$lib/components/ui/AIDialog.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let dialogOpen = $state(false);
	let aiDialogOpen = $state(false);

	export const ssr = false;
</script>

<div class="p-6 max-w-2xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Dialog Components</h1>
		<p class="text-sm opacity-60">DialogWrapper with analytics tracking and close handling, plus AIDialog with accessible modal layout.</p>
	</header>

	<div class="flex gap-3">
		<button class="px-4 py-2 rounded border border-sand/30 hover:border-sand/50 text-sm" onclick={() => dialogOpen = true}>
			<Icon name="square" size={14} /> Open DialogWrapper
		</button>
		<button class="px-4 py-2 rounded border border-info/30 hover:border-info/50 text-sm" onclick={() => aiDialogOpen = true}>
			<Icon name="brain" size={14} /> Open AI Dialog
		</button>
	</div>

	<DialogWrapper bind:open={dialogOpen} title="DialogWrapper Demo" description="This dialog has analytics tracking and close handling.">
		<p class="text-sm">This is the DialogWrapper component (117L) with title, description, and close event handling.</p>
	</DialogWrapper>

	<AIDialog bind:open={aiDialogOpen} title="AI Analysis" onClose={() => aiDialogOpen = false}>
		<p class="text-sm">This is the AIDialog component (51L) — a simple accessible modal for AI features.</p>
	</AIDialog>
</div>