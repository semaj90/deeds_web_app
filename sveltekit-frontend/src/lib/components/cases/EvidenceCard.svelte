<script lang="ts">
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

	function getTypeColor(type: string) {
		switch (type) {
			case 'document': return 'bg-info/10 text-info';
			case 'photo': return 'bg-info/10 text-info';
			case 'video': return 'bg-danger/10 text-danger';
			case 'audio': return 'bg-accent/10 text-accent';
			case 'physical': return 'bg-warning/10 text-warning';
			case 'digital': return 'bg-info/10 text-info';
			case 'testimony': return 'bg-warning/10 text-warning';
			default: return 'bg-sand/10 text-sand';
		}
	}

	let evidenceIconName = $derived(getEvidenceIconName(evidence.evidenceType || evidence.type));
	let formattedDate = $derived(
		formatDistanceToNow(
			new Date(evidence.createdAt || evidence.dateCollected || Date.now())
		)
	);

	function handleEdit() {
		if (!disabled) { onedit?.(); }
	}

	function handleDelete() {
		if (!disabled) { ondelete?.(); }
	}

	function handleView() {
		if (!disabled) { onview?.(); }
	}

	function handleDownload() {
		if (!disabled) { ondownload?.(); }
	}
</script>

<div
	class="bg-white rounded-lg shadow-sm border p-4 transition-all"
	class:opacity-60={disabled}
	class:pointer-events-none={disabled}
>
	<div class="flex items-start">
		<div class="flex-shrink-0">
			<Icon name={evidenceIconName} class="h-6 w-6" />
		</div>

		<div class="flex-1">
			<h4 class="text-sm font-medium text-sand">{evidence.title}</h4>

			<div class="mt-1">
				<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getTypeColor(evidence.evidenceType || evidence.type)}">
					{evidence.evidenceType || evidence.type}
				</span>
			</div>

			{#if evidence.description}
				<p class="mt-2 text-sm text-sand/60">{evidence.description}</p>
			{/if}

			<div class="mt-2 flex items-center text-xs">
				<Icon name="calendar" class="h-3 w-3" />
				{formattedDate}
			</div>
		</div>

		<!-- Actions -->
		<div class="flex-shrink-0 flex items-center">
			<button
				onclick={() => handleView()}
				class="p-1 text-sand/40 hover:text-sand/60 rounded"
				title="View evidence"
				{disabled}
			>
				<Icon name="eye" class="h-4" />
			</button>

			<button
				onclick={() => handleEdit()}
				class="p-1 text-sand/40 hover:text-sand/60 rounded"
				title="Edit evidence"
				{disabled}
			>
				<Icon name="edit" class="h-4" />
			</button>

			<button
				onclick={() => handleDownload()}
				class="p-1 text-sand/40 hover:text-sand/60 rounded"
				title="Download evidence"
				{disabled}
			>
				<Icon name="download" class="h-4" />
			</button>

			<button
				onclick={() => handleDelete()}
				class="p-1 text-danger/80 hover:text-danger rounded"
				title="Delete evidence"
				{disabled}
			>
				<Icon name="trash-2" class="h-4" />
			</button>
		</div>
	</div>
</div>

<style>
	/* @unocss-include */
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
