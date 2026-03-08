<!-- EvidenceCard.svelte - Basic AI Analysis Display (Svelte 5 + Card/Badge) -->
<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { Evidence } from '$lib/schemas/evidence';

	interface Props {
		evidence: Evidence;
		onAskAI?: (evidence: Evidence) => void;
		onDelete?: (id: string) => void;
	}

	let { evidence, onAskAI, onDelete }: Props = $props();

	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

	function formatDate(date: Date | undefined): string {
		if (!date) return 'Unknown';
		const diffSec = Math.round((new Date(date).getTime() - Date.now()) / 1000);
		const absSec = Math.abs(diffSec);
		if (absSec < 60) return rtf.format(diffSec, 'second');
		if (absSec < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
		if (absSec < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
		return rtf.format(Math.round(diffSec / 86400), 'day');
	}

	function formatFileSize(bytes: number | undefined): string {
		if (!bytes || bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}
</script>

<Card variant="elevated" padding="md" class="hover:shadow-xl transition-shadow">
	<!-- Header -->
	<div class="flex justify-between items-start mb-3">
		<div class="flex-1 min-w-0">
			<h3 class="text-base font-semibold text-sand truncate">{evidence.file_name}</h3>
			<Badge variant="default" size="sm" class="mt-1">{evidence.evidence_type}</Badge>
		</div>
		<div class="flex gap-2 ml-2">
			{#if onAskAI}
				<button class="px-3 py-1.5 bg-info text-white rounded text-xs font-medium hover:bg-info/80 transition" onclick={() => onAskAI(evidence)}>
					<Icon name="message-circle" size={12} class="inline mr-1" />Ask AI
				</button>
			{/if}
			{#if onDelete}
				<button class="px-3 py-1.5 bg-danger text-white rounded text-xs font-medium hover:bg-danger/80 transition" onclick={() => onDelete?.(evidence.id ?? '')}>
					<Icon name="trash-2" size={12} class="inline mr-1" />Delete
				</button>
			{/if}
		</div>
	</div>

	<!-- AI Summary -->
	{#if evidence.ai_summary}
		<div class="mb-3 p-2 bg-info/5 b-l-3 b-info/40 rounded-r">
			<h4 class="text-xs font-semibold text-sand/60 mb-1">AI Summary</h4>
			<p class="text-sm leading-relaxed text-sand/80">{evidence.ai_summary}</p>
		</div>
	{/if}

	<!-- Metadata Grid -->
	<div class="grid grid-cols-3 gap-2 mb-3 text-xs">
		<div>
			<span class="block font-semibold text-sand/50">File Type</span>
			<span class="text-sand/80">{evidence.file_type}</span>
		</div>
		<div>
			<span class="block font-semibold text-sand/50">Size</span>
			<span class="text-sand/80">{formatFileSize(evidence.file_size)}</span>
		</div>
		<div>
			<span class="block font-semibold text-sand/50">Uploaded</span>
			<span class="text-sand/80">{formatDate(evidence.uploaded_at)}</span>
		</div>
	</div>

	<!-- Tags -->
	{#if evidence.tags && evidence.tags.length > 0}
		<div class="mb-3">
			<h4 class="text-xs font-semibold text-sand/50 mb-1">Tags</h4>
			<div class="flex flex-wrap gap-1">
				{#each evidence.tags as tag}
					<Badge variant="primary" size="sm">{tag}</Badge>
				{/each}
			</div>
		</div>
	{/if}

	<!-- AI Tags -->
	{#if evidence.ai_tags && evidence.ai_tags.length > 0}
		<div class="mb-3">
			<h4 class="text-xs font-semibold text-sand/50 mb-1">AI Tags</h4>
			<div class="flex flex-wrap gap-1">
				{#each evidence.ai_tags as tag}
					<Badge variant="secondary" size="sm">{tag}</Badge>
				{/each}
			</div>
		</div>
	{/if}

	<!-- AI Analysis (chat turns) -->
	{#if (evidence as any).chat_turns && (evidence as any).chat_turns.length > 0}
		<div class="mb-3 p-2 bg-warning/5 b-l-3 b-warning/40 rounded-r">
			<h4 class="text-sm font-semibold text-warning mb-2">AI Analysis</h4>
			{#each (evidence as any).chat_turns as turn}
				{#if turn.keywords && turn.keywords.length > 0}
					<div class="mb-2">
						<h5 class="text-xs font-semibold text-sand/50 mb-1">Keywords</h5>
						<div class="flex flex-wrap gap-1">
							{#each turn.keywords as keyword}
								<Badge variant="warning" size="sm">{keyword}</Badge>
							{/each}
						</div>
					</div>
				{/if}
				{#if turn.suggestions && turn.suggestions.length > 0}
					<div class="mb-2">
						<h5 class="text-xs font-semibold text-sand/50 mb-1">AI Suggestions</h5>
						<ul class="list-disc pl-4 text-xs text-sand/70 space-y-0.5">
							{#each turn.suggestions as suggestion}
								<li>{suggestion}</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- File Link -->
	{#if evidence.file_url}
		<div class="pt-3 b-t b-sand/10">
			<a href={evidence.file_url} target="_blank" rel="noopener noreferrer" class="text-info text-sm font-medium hover:underline">
				<Icon name="external-link" size={14} class="inline mr-1" />View File
			</a>
		</div>
	{/if}
</Card>
