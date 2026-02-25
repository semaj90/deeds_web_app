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

<div class="ai-recommendations">
	<h4 class="rec-header">
		<Icon name="lightbulb" size={14} />
		Recommended Next Actions
	</h4>

	{#if isLoading}
		<p class="rec-loading">Loading suggestions...</p>
	{:else if recommendations.length === 0}
		<p class="rec-empty">Chat more to get personalized suggestions</p>
	{:else}
		<ul class="rec-list">
			{#each recommendations as item}
				<li>
					<button
						class="rec-item"
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

<style>
	.ai-recommendations {
		padding: 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		background: var(--color-panel-soft, #1c1917);
	}
	.rec-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}
	.rec-loading, .rec-empty {
		font-size: 0.75rem;
		opacity: 0.5;
		margin: 0;
	}
	.rec-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.rec-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.375rem 0.5rem;
		border: none;
		border-radius: 0.25rem;
		background: transparent;
		color: inherit;
		font-size: 0.8125rem;
		cursor: pointer;
		text-align: left;
		transition: background-color 0.15s;
	}
	.rec-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}
</style>
