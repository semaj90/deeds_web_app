<script lang="ts">
	import Svelte5Avatar from '$lib/components/ui/avatar/Svelte5Avatar.svelte';
	import Svelte5Badge from '$lib/components/ui/badge/Svelte5Badge.svelte';
	import Svelte5Card from '$lib/components/ui/card/Svelte5Card.svelte';
	import Svelte5Dialog from '$lib/components/ui/bits/Svelte5Dialog.svelte';
	import Svelte5Input from '$lib/components/ui/input/Svelte5Input.svelte';
	import Svelte5Progress from '$lib/components/ui/progress/Svelte5Progress.svelte';
	import Svelte5DropdownMenu from '$lib/components/ui/dropdown/Svelte5DropdownMenu.svelte';
	import InputBits from '$lib/components/ui/input/InputBits.svelte';
	import QuickActionButton from '$lib/components/ui/QuickActionButton.svelte';
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import ContextMenuItem from '$lib/components/ui/ContextMenuItem.svelte';
	import AIButton from '$lib/components/ai/AIButton.svelte';
	import StatsCard from '$lib/components/ui/StatsCard.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let dialogOpen = $state(false);
	let inputValue = $state('');
	let progress = $state(65);

	export const ssr = false;
</script>

<div class="p-6 max-w-4xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Svelte 5 Primitives Gallery</h1>
		<p class="text-sm opacity-60">Reference implementations: Avatar, Badge, Card, Dialog, Input, Progress, Dropdown, QuickAction, StatsCard, AIButton.</p>
	</header>

	<div class="space-y-8">
		<!-- Avatar -->
		<section>
			<h2 class="text-sm font-bold mb-3 opacity-70">Avatar (159L)</h2>
			<div class="flex items-center gap-3">
				<Svelte5Avatar alt="John Doe" initials="JD" size="sm" />
				<Svelte5Avatar alt="Jane Smith" initials="JS" size="md" status="online" />
				<Svelte5Avatar alt="AI" initials="AI" size="lg" status="busy" />
			</div>
		</section>

		<!-- Badge -->
		<section>
			<h2 class="text-sm font-bold mb-3 opacity-70">Badge (74L)</h2>
			<div class="flex flex-wrap gap-2">
				<Svelte5Badge variant="default">Default</Svelte5Badge>
				<Svelte5Badge variant="success">Success</Svelte5Badge>
				<Svelte5Badge variant="warning">Warning</Svelte5Badge>
				<Svelte5Badge variant="error">Error</Svelte5Badge>
				<Svelte5Badge variant="outline">Outline</Svelte5Badge>
				<Svelte5Badge removable onremove={() => {}}>Removable</Svelte5Badge>
			</div>
		</section>

		<!-- Card -->
		<section>
			<h2 class="text-sm font-bold mb-3 opacity-70">Card (124L)</h2>
			<Svelte5Card variant="default">
				{#snippet header()}
					<h3 class="font-bold">Evidence Summary</h3>
				{/snippet}
				<p class="text-sm opacity-70">This is a flexible card container with snippet support for header and footer areas.</p>
			</Svelte5Card>
		</section>

		<!-- Input -->
		<section>
			<h2 class="text-sm font-bold mb-3 opacity-70">Input (166L) + InputBits (59L)</h2>
			<div class="grid grid-cols-2 gap-4">
				<Svelte5Input bind:value={inputValue} label="Svelte5Input" placeholder="Type here..." />
				<InputBits value="" placeholder="InputBits wrapper" />
			</div>
		</section>

		<!-- Progress -->
		<section>
			<h2 class="text-sm font-bold mb-3 opacity-70">Progress (119L)</h2>
			<div class="space-y-3">
				<Svelte5Progress value={progress} />
				<Svelte5Progress indeterminate={true} />
				<input type="range" min="0" max="100" bind:value={progress} class="w-48" />
			</div>
		</section>

		<!-- Dropdown -->
		<section>
			<h2 class="text-sm font-bold mb-3 opacity-70">Dropdown (131L) + Svelte5DropdownMenu (206L)</h2>
			<div class="flex gap-4">
				<Dropdown>
					{#snippet trigger({ open })}
						<span class="px-3 py-1.5 rounded border border-sand/30 text-sm">Actions {open ? '▲' : '▼'}</span>
					{/snippet}
					<ContextMenuItem onselect={() => console.log('Edit')}>Edit</ContextMenuItem>
					<ContextMenuItem onselect={() => console.log('Delete')}>Delete</ContextMenuItem>
				</Dropdown>
				<Svelte5DropdownMenu items={[{ id: '1', label: 'Option A' }, { id: '2', label: 'Option B' }]} />
			</div>
		</section>

		<!-- StatsCard + QuickAction + AIButton -->
		<section>
			<h2 class="text-sm font-bold mb-3 opacity-70">StatsCard (44L) + QuickAction (77L) + AIButton (215L)</h2>
			<div class="flex items-center gap-4 flex-wrap">
				<StatsCard title="Active Cases" value="42" />
				<QuickActionButton label="Analyze" model="gemma3-legal:latest" prompt="Summarize the current case status" />
				<AIButton tooltip="Ask AI" onclick={() => console.log('AI!')} />
			</div>
		</section>

		<!-- Dialog -->
		<section>
			<h2 class="text-sm font-bold mb-3 opacity-70">Dialog (199L)</h2>
			<button class="px-4 py-2 rounded border border-sand/30 hover:border-sand/50 text-sm" onclick={() => dialogOpen = true}>
				Open Svelte5Dialog
			</button>
			<Svelte5Dialog bind:open={dialogOpen} title="Svelte 5 Dialog" description="bits-ui Dialog wrapper with accessibility and size/variant options.">
				<p class="text-sm">Dialog content goes here.</p>
			</Svelte5Dialog>
		</section>
	</div>
</div>
