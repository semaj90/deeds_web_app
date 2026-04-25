<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { onMount } from 'svelte';

	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	interface UploadStats {
		totalUploads: number;
		totalSize: string;
		byType: { type: string; count: number; size: string }[];
		recent: { name: string; type: string; size: string; uploadedAt: string; status: string }[];
		processingRate: number;
		avgProcessingTime: string;
	}

	let stats = $state<UploadStats | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function loadStats() {
		loading = true;
		error = null;
		try {
			const [evidenceRes, analyticsRes] = await Promise.allSettled([
				fetch('/api/evidence?limit=20').then(r => r.ok ? r.json() : null),
				fetch('/api/analytics/summary').then(r => r.ok ? r.json() : null),
			]);

			const evidence = evidenceRes.status === 'fulfilled' ? evidenceRes.value : null;
			const analytics = analyticsRes.status === 'fulfilled' ? analyticsRes.value : null;

			const items = evidence?.evidence ?? evidence?.data ?? [];
			const typeCounts = new Map<string, { count: number; bytes: number }>();

			let totalBytes = 0;
			for (const item of items) {
				const type = item.type ?? item.fileType ?? item.mimeType ?? 'unknown';
				const size = item.fileSize ?? item.size ?? 0;
				totalBytes += size;
				const entry = typeCounts.get(type) ?? { count: 0, bytes: 0 };
				entry.count++;
				entry.bytes += size;
				typeCounts.set(type, entry);
			}

			stats = {
				totalUploads: items.length,
				totalSize: formatBytes(totalBytes),
				byType: Array.from(typeCounts.entries())
					.map(([type, v]) => ({ type, count: v.count, size: formatBytes(v.bytes) }))
					.sort((a, b) => b.count - a.count),
				recent: items.slice(0, 8).map((item: any) => ({
					name: item.title ?? item.filename ?? item.name ?? 'Untitled',
					type: item.type ?? item.fileType ?? 'unknown',
					size: formatBytes(item.fileSize ?? item.size ?? 0),
					uploadedAt: item.createdAt ?? item.uploadedAt ?? '',
					status: item.status ?? 'processed',
				})),
				processingRate: analytics?.processingRate ?? 0,
				avgProcessingTime: analytics?.avgProcessingTime ?? 'N/A',
			};
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load stats';
		} finally {
			loading = false;
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0B';
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	const TYPE_ICONS: Record<string, string> = {
		pdf: 'file-text',
		document: 'file-text',
		image: 'image',
		text: 'file',
		unknown: 'file-question',
	};

	function getTypeIcon(type: string): string {
		const lower = type.toLowerCase();
		for (const [key, icon] of Object.entries(TYPE_ICONS)) {
			if (lower.includes(key)) return icon;
		}
		return 'file';
	}

	onMount(loadStats);
</script>

<div class="flex flex-col gap-4 {className}">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Icon name="bar-chart-3" size={18} class="text-emerald-400" />
			<span class="font-mono text-sm text-stone-200 tracking-wider">UPLOAD ANALYTICS</span>
		</div>
		<button
			class="px-2.5 py-1 text-[11px] font-mono rounded border border-stone-700 bg-transparent text-stone-500 hover:text-white hover:border-emerald-600 cursor-pointer transition-colors"
			onclick={loadStats}
			disabled={loading}
		>
			{loading ? 'Loading...' : 'Refresh'}
		</button>
	</div>

	{#if loading && !stats}
		<div class="flex items-center justify-center py-8 text-stone-600 text-sm">
			<Icon name="loader-2" size={16} class="animate-spin mr-2" />
			Loading analytics...
		</div>
	{:else if error}
		<div class="text-red-400 text-sm flex items-center gap-2">
			<Icon name="alert-triangle" size={14} />
			{error}
		</div>
	{:else if stats}
		<!-- Summary Cards -->
		<div class="grid grid-cols-3 gap-3">
			<div class="px-4 py-3 rounded-lg bg-stone-800/50 border border-stone-700">
				<p class="text-[10px] text-stone-500 uppercase tracking-wider m-0">Total Uploads</p>
				<p class="text-xl font-bold text-stone-200 m-0 mt-1">{stats.totalUploads}</p>
			</div>
			<div class="px-4 py-3 rounded-lg bg-stone-800/50 border border-stone-700">
				<p class="text-[10px] text-stone-500 uppercase tracking-wider m-0">Total Size</p>
				<p class="text-xl font-bold text-stone-200 m-0 mt-1">{stats.totalSize}</p>
			</div>
			<div class="px-4 py-3 rounded-lg bg-stone-800/50 border border-stone-700">
				<p class="text-[10px] text-stone-500 uppercase tracking-wider m-0">File Types</p>
				<p class="text-xl font-bold text-stone-200 m-0 mt-1">{stats.byType.length}</p>
			</div>
		</div>

		<!-- Type Breakdown -->
		{#if stats.byType.length > 0}
			<div class="rounded-lg border border-stone-700 overflow-hidden">
				<div class="px-4 py-2 bg-stone-800/50 border-b border-stone-700">
					<span class="text-[11px] text-stone-400 font-mono tracking-wider">BY FILE TYPE</span>
				</div>
				{#each stats.byType as entry}
					<div class="flex items-center gap-3 px-4 py-2 border-b border-stone-800 last:border-b-0">
						<Icon name={getTypeIcon(entry.type)} size={14} class="text-stone-500" />
						<span class="text-sm text-stone-300 flex-1">{entry.type}</span>
						<span class="text-xs text-stone-500">{entry.count} files</span>
						<span class="text-xs text-stone-600">{entry.size}</span>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Recent Uploads -->
		{#if stats.recent.length > 0}
			<div class="rounded-lg border border-stone-700 overflow-hidden">
				<div class="px-4 py-2 bg-stone-800/50 border-b border-stone-700">
					<span class="text-[11px] text-stone-400 font-mono tracking-wider">RECENT UPLOADS</span>
				</div>
				{#each stats.recent as item}
					<div class="flex items-center gap-3 px-4 py-2 border-b border-stone-800 last:border-b-0">
						<Icon name={getTypeIcon(item.type)} size={14} class="text-stone-500" />
						<span class="text-sm text-stone-300 truncate flex-1">{item.name}</span>
						<span class="text-[11px] text-stone-600">{item.size}</span>
						<span class="text-[11px] text-stone-600">{formatDate(item.uploadedAt)}</span>
						<span class="text-[10px] px-1.5 py-px rounded"
							class:bg-emerald-950={item.status === 'processed'}
							class:text-emerald-400={item.status === 'processed'}
							class:bg-amber-950={item.status === 'processing'}
							class:text-amber-400={item.status === 'processing'}
							class:bg-stone-800={item.status !== 'processed' && item.status !== 'processing'}
							class:text-stone-500={item.status !== 'processed' && item.status !== 'processing'}
						>{item.status}</span>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
