<script lang="ts">
	/**
	 * EvidenceRecall — Recently viewed/accessed evidence tracker
	 *
	 * Tracks evidence items the user has viewed, searched, or interacted with.
	 * Stores in localStorage with 30-day TTL. Shows a compact recent evidence
	 * list for quick recall and re-access.
	 *
	 * Features:
	 *   - Tracks view/search/upload events with timestamps
	 *   - Groups by case for context
	 *   - Quick-access links to evidence detail
	 *   - Clear history option
	 */
	import Icon from '$lib/components/ui/Icon.svelte';

	interface RecallItem {
		evidenceId: string;
		title: string;
		caseId?: string;
		caseName?: string;
		evidenceType: string;
		action: 'viewed' | 'searched' | 'uploaded' | 'analyzed';
		timestamp: number;
	}

	interface Props {
		class?: string;
		maxItems?: number;
		onSelect?: (item: RecallItem) => void;
	}

	let {
		class: className = '',
		maxItems = 15,
		onSelect
	}: Props = $props();

	const STORAGE_KEY = 'evidence-recall-history';
	const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

	let items = $state<RecallItem[]>([]);
	let showAll = $state(false);

	// Group items by case
	let groupedByCaseId = $derived.by(() => {
		const groups = new Map<string, RecallItem[]>();
		const sorted = [...items].sort((a, b) => b.timestamp - a.timestamp);
		const limited = showAll ? sorted : sorted.slice(0, maxItems);

		for (const item of limited) {
			const key = item.caseId ?? 'uncategorized';
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(item);
		}
		return groups;
	});

	let displayItems = $derived(
		[...items].sort((a, b) => b.timestamp - a.timestamp).slice(0, showAll ? items.length : maxItems)
	);

	// Load from localStorage on mount
	$effect(() => {
		if (typeof window === 'undefined') return;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as RecallItem[];
				const now = Date.now();
				// Filter out expired items
				items = parsed.filter(item => now - item.timestamp < TTL_MS);
			}
		} catch {
			items = [];
		}
	});

	function save() {
		if (typeof window === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
		} catch { /* quota exceeded */ }
	}

	/** Record a new evidence interaction (call from parent components) */
	export function recordAccess(item: RecallItem) {
		// Deduplicate: update timestamp if same evidence + action within 5 minutes
		const existing = items.findIndex(
			i => i.evidenceId === item.evidenceId && i.action === item.action &&
			     Math.abs(i.timestamp - item.timestamp) < 5 * 60 * 1000
		);

		if (existing >= 0) {
			items[existing].timestamp = item.timestamp;
		} else {
			items = [item, ...items].slice(0, 100); // Keep max 100
		}
		save();
	}

	function clearHistory() {
		items = [];
		if (typeof window !== 'undefined') {
			localStorage.removeItem(STORAGE_KEY);
		}
	}

	function formatTime(timestamp: number): string {
		const diff = Date.now() - timestamp;
		const minutes = Math.floor(diff / 60000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	const actionIcons: Record<string, string> = {
		viewed: 'eye',
		searched: 'search',
		uploaded: 'upload',
		analyzed: 'brain'
	};
</script>

<div class="evidence-recall {className}" role="region" aria-label="Recently accessed evidence">
	<div class="flex items-center justify-between mb-3">
		<h3 class="text-sm font-semibold text-white flex items-center gap-2">
			<Icon name="history" class="w-4 h-4 text-accent" />
			Evidence Recall
			{#if items.length > 0}
				<span class="text-xs text-sand/50 font-normal">({items.length})</span>
			{/if}
		</h3>
		{#if items.length > 0}
			<button
				type="button"
				class="text-xs text-sand/40 hover:text-danger transition-colors"
				onclick={clearHistory}
				aria-label="Clear evidence recall history"
			>
				Clear
			</button>
		{/if}
	</div>

	{#if items.length === 0}
		<div class="text-center py-6 text-sand/40 text-sm">
			<Icon name="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50" />
			<p>No recently accessed evidence</p>
			<p class="text-xs mt-1">View, search, or upload evidence to see it here</p>
		</div>
	{:else}
		<div class="space-y-1" role="list">
			{#each displayItems as item (item.evidenceId + item.timestamp)}
				<button
					type="button"
					class="w-full flex items-center gap-3 px-3 py-2 text-left rounded hover:bg-sand/10 transition-colors group"
					onclick={() => onSelect?.(item)}
					role="listitem"
					aria-label="{item.action} {item.title} — {formatTime(item.timestamp)}"
				>
					<div class="flex-shrink-0 w-6 h-6 rounded bg-sand/10 flex items-center justify-center">
						<Icon name={actionIcons[item.action] ?? 'file'} class="w-3.5 h-3.5 text-sand/50 group-hover:text-accent" />
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm text-sand/80 group-hover:text-white truncate">
							{item.title}
						</p>
						<div class="flex items-center gap-2 text-xs text-sand/40">
							<span class="capitalize">{item.action}</span>
							{#if item.caseName}
								<span class="truncate max-w-[120px]">{item.caseName}</span>
							{/if}
						</div>
					</div>
					<span class="text-xs text-sand/30 flex-shrink-0">
						{formatTime(item.timestamp)}
					</span>
				</button>
			{/each}
		</div>

		{#if items.length > maxItems && !showAll}
			<button
				type="button"
				class="w-full mt-2 py-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
				onclick={() => showAll = true}
			>
				Show all {items.length} items
			</button>
		{/if}
	{/if}
</div>

<style>
	.evidence-recall {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		padding: 12px;
	}
</style>
