<script lang="ts">
	import Fuse from 'fuse.js';
	import { clientCache } from '$lib/ai/client-cache.js';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		maxItems?: number;
		onselect?: (prompt: string) => void;
	}

	let { maxItems = 3, onselect }: Props = $props();

	interface HistoryEntry {
		query: string;
		response: string;
		timestamp: number;
	}

	let recommendations = $state<HistoryEntry[]>([]);
	let isLoading = $state(true);

	$effect(() => {
		loadRecommendations();
	});

	async function loadRecommendations() {
		isLoading = true;
		try {
			const history = await clientCache.getChatHistory('default');
			if (!history || history.length < 2) {
				recommendations = [];
				return;
			}

			const entries: HistoryEntry[] = history
				.filter((m: { role: string }) => m.role === 'user')
				.map((m: { content: string; timestamp?: number }) => ({
					query: m.content,
					response: '',
					timestamp: m.timestamp ?? Date.now()
				}));

			if (entries.length === 0) {
				recommendations = [];
				return;
			}

			const fuse = new Fuse(entries, {
				keys: ['query'],
				threshold: 0.4,
				includeScore: true
			});

			const lastQuery = entries[entries.length - 1]?.query;
			if (lastQuery) {
				const results = fuse.search(lastQuery);
				recommendations = results
					.filter((r) => r.item.query !== lastQuery)
					.map((r) => r.item)
					.slice(0, maxItems);
			}
		} catch {
			recommendations = [];
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="p-3 border border-sand-dark rounded-lg bg-panel-soft">
	<h4 class="flex items-center gap-2 text-[13px] font-semibold mb-2 m-0">
		<Icon name="lightbulb" size={14} />
		Recommended Next Actions
	</h4>

	{#if isLoading}
		<p class="text-xs opacity-50 m-0">Loading suggestions...</p>
	{:else if recommendations.length === 0}
		<p class="text-xs opacity-50 m-0">Chat more to get personalized suggestions</p>
	{:else}
		<ul class="list-none p-0 m-0 flex flex-col gap-1">
			{#each recommendations as item}
				<li>
					<button
						class="flex items-center gap-2 w-full py-1.5 px-2 border-none rounded bg-transparent text-inherit text-[13px] cursor-pointer text-left hover:bg-white/5"
						onclick={() => onselect?.(item.query)}
					>
						<Icon name="message-circle" size={12} />
						<span>{item.query.length > 80 ? item.query.slice(0, 80) + '...' : item.query}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
