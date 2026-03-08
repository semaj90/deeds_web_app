<!-- EvidenceCard.svelte - Svelte 5 runes + Svelte 5 UI components -->
<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';

	interface Props {
		item: {
			id: string;
			title: string;
			evidenceType: string;
			fileSize?: number;
			createdAt: Date;
			tags: string[];
			url?: string;
		};
		onview?: () => void;
	}

	let { item, onview }: Props = $props();

	const typeIcon = $derived.by(() => {
		switch (item.evidenceType) {
			case 'image': return '🖼️';
			case 'video': return '🎥';
			case 'audio': return '🎵';
			case 'document': return '📝';
			case 'email': return '📧';
			default: return '📁';
		}
	});

	function timeAgo(date: Date): string {
		const seconds = Math.round((Date.now() - date.getTime()) / 1000);
		const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
		if (seconds < 60) return rtf.format(-seconds, 'second');
		const minutes = Math.round(seconds / 60);
		if (minutes < 60) return rtf.format(-minutes, 'minute');
		const hours = Math.round(minutes / 60);
		if (hours < 24) return rtf.format(-hours, 'hour');
		const days = Math.round(hours / 24);
		if (days < 30) return rtf.format(-days, 'day');
		const months = Math.round(days / 30);
		if (months < 12) return rtf.format(-months, 'month');
		return rtf.format(-Math.round(days / 365), 'year');
	}

	function formatSize(bytes?: number) {
		if (!bytes) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}
</script>

<Card variant="default" padding="sm" class="hover:b-accent transition-colors cursor-pointer group">
	<div class="flex items-start gap-3">
		<div class="text-2xl mt-1">{typeIcon}</div>
		<div class="flex-1 min-w-0">
			<h3 class="text-sm font-bold uppercase truncate mb-1">{item.title}</h3>
			<div class="flex flex-wrap gap-1 mb-2">
				<Badge variant="primary" size="sm">{item.evidenceType}</Badge>
				{#if item.tags}
					{#each item.tags.slice(0, 2) as tag}
						<Badge variant="outline" size="sm">{tag}</Badge>
					{/each}
				{/if}
			</div>
			<div class="flex justify-between items-center text-[10px] opacity-60">
				<span>{formatSize(item.fileSize)}</span>
				{#if item.createdAt}
					<span>{timeAgo(new Date(item.createdAt))}</span>
				{/if}
			</div>
		</div>
	</div>

	<div class="mt-2 pt-2 b-t b-accent/10 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
		<button class="px-3 py-1 bg-accent text-white rounded text-[10px] font-medium hover:bg-accent/80 transition" onclick={(e) => { e.stopPropagation(); onview?.(); }}>
			VIEW
		</button>
	</div>
</Card>