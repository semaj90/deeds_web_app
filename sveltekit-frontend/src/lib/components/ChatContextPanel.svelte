<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { browser } from '$app/environment';

	interface ContextItem {
		id: string;
		type: 'topic' | 'shard';
		title: string;
		data: { clusterSize?: number; tags?: string[]; chunkCount?: number; status?: string };
	}

	let items = $state<ContextItem[]>([]);

	$effect(() => {
		if (!browser) return;

		const handleTopic = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.id) {
				items = [...items.filter(i => i.id !== detail.id), { ...detail, type: 'topic' }];
			}
		};
		const handleShard = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.id) {
				items = [...items.filter(i => i.id !== detail.id), { ...detail, type: 'shard' }];
			}
		};

		window.addEventListener('topicToChat', handleTopic);
		window.addEventListener('shardToChat', handleShard);

		return () => {
			window.removeEventListener('topicToChat', handleTopic);
			window.removeEventListener('shardToChat', handleShard);
		};
	});

	function removeItem(id: string) {
		items = items.filter(i => i.id !== id);
	}

	function clearAll() {
		items = [];
	}
</script>

{#if items.length > 0}
	<div class="mb-4 p-3 bg-stone-900 border border-stone-700 rounded">
		<div class="flex items-center justify-between mb-2">
			<h3 class="text-xs font-mono tracking-wide text-stone-200 m-0 flex items-center gap-1.5">
				<Icon name="pin" size={12} />
				PINNED CONTEXT ({items.length})
			</h3>
			<button
				class="text-[10px] text-red-400/80 hover:text-red-300 bg-transparent border-none cursor-pointer"
				onclick={clearAll}
			>
				CLEAR ALL
			</button>
		</div>

		<div class="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
			{#each items as item (item.id)}
				<div class="flex items-center justify-between p-2 bg-stone-800/80 rounded text-[10px]">
					<div class="flex-1 min-w-0">
						<div class="font-mono text-stone-200 truncate">
							{item.type.toUpperCase()}: {item.title}
						</div>
						<div class="text-stone-500 mt-0.5">
							{#if item.type === 'topic'}
								{item.data.clusterSize ?? 0} items
								{#if item.data.tags?.length}
									&middot; {item.data.tags.slice(0, 3).join(', ')}
								{/if}
							{:else}
								{item.data.chunkCount ?? 0} chunks &middot; {item.data.status ?? 'ready'}
							{/if}
						</div>
					</div>
					<button
						class="ml-2 text-red-400/80 hover:text-red-300 bg-transparent border-none cursor-pointer text-xs p-0.5"
						onclick={() => removeItem(item.id)}
					>
						<Icon name="x" size={12} />
					</button>
				</div>
			{/each}
		</div>
	</div>
{/if}
