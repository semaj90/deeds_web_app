<!-- EvidenceCard.svelte - Cases CRUD Actions (Svelte 5 + Card/Badge) -->
<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

	function formatDistanceToNow(date: Date): string {
		const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
		const absSec = Math.abs(diffSec);
		if (absSec < 60) return rtf.format(diffSec, 'second');
		if (absSec < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
		if (absSec < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
		return rtf.format(Math.round(diffSec / 86400), 'day');
	}

	function getEvidenceIconName(type: string): string {
		switch (type) {
			case 'document': return 'file-text';
			case 'photo': return 'image';
			case 'video': return 'video';
			case 'audio': return 'headphones';
			case 'physical': return 'archive';
			case 'digital': return 'file-text';
			case 'testimony': return 'file-text';
			default: return 'file-text';
		}
	}

	function getTypeVariant(type: string): 'primary' | 'success' | 'warning' | 'destructive' | 'default' {
		switch (type) {
			case 'document': case 'digital': case 'link': return 'primary';
			case 'photo': case 'image': return 'success';
			case 'video': return 'destructive';
			case 'audio': return 'warning';
			case 'physical': case 'testimony': return 'warning';
			default: return 'default';
		}
	}

	interface Props {
		evidence: any;
		disabled?: boolean;
		onedit?: (event?: any) => void;
		ondelete?: (event?: any) => void;
		onview?: (event?: any) => void;
		ondownload?: (event?: any) => void;
	}

	let {
		evidence,
		disabled = false,
		onedit,
		ondelete,
		onview,
		ondownload
	}: Props = $props();

	let evidenceIconName = $derived(getEvidenceIconName(evidence.evidenceType || evidence.type));
	let evidenceType = $derived(evidence.evidenceType || evidence.type || 'document');
	let formattedDate = $derived(
		formatDistanceToNow(new Date(evidence.createdAt || evidence.dateCollected || Date.now()))
	);
</script>

<Card variant="default" padding="md" class={disabled ? 'opacity-60 pointer-events-none' : ''}>
	<div class="flex items-start">
		<div class="flex-shrink-0 mr-3">
			<Icon name={evidenceIconName} class="w-6 h-6 text-sand/60" />
		</div>

		<div class="flex-1 min-w-0">
			<h4 class="text-sm font-medium text-sand truncate">{evidence.title}</h4>

			<div class="mt-1">
				<Badge variant={getTypeVariant(evidenceType)} size="sm">{evidenceType}</Badge>
			</div>

			{#if evidence.description}
				<p class="mt-2 text-sm text-sand/60 line-clamp-2">{evidence.description}</p>
			{/if}

			<div class="mt-2 flex items-center gap-1 text-xs text-sand/40">
				<Icon name="calendar" size={12} />
				{formattedDate}
			</div>
		</div>

		<!-- CRUD Actions -->
		<div class="flex-shrink-0 flex items-center gap-0.5 ml-2">
			<button onclick={() => onview?.()} class="p-1.5 text-sand/40 hover:text-sand rounded transition" title="View" {disabled} aria-label="View evidence">
				<Icon name="eye" size={16} />
			</button>
			<button onclick={() => onedit?.()} class="p-1.5 text-sand/40 hover:text-sand rounded transition" title="Edit" {disabled} aria-label="Edit evidence">
				<Icon name="edit" size={16} />
			</button>
			<button onclick={() => ondownload?.()} class="p-1.5 text-sand/40 hover:text-sand rounded transition" title="Download" {disabled} aria-label="Download evidence">
				<Icon name="download" size={16} />
			</button>
			<button onclick={() => ondelete?.()} class="p-1.5 text-danger/60 hover:text-danger rounded transition" title="Delete" {disabled} aria-label="Delete evidence">
				<Icon name="trash-2" size={16} />
			</button>
		</div>
	</div>
</Card>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
