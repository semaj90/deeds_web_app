<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface CitationData {
		id?: string;
		statute_code?: string;
		statute_title?: string;
		jurisdiction?: string;
		severity?: string;
		highlighted_text?: string;
		notes?: string;
		case_id?: string;
		source_type?: string;
	}

	let {
		citation,
		size = 'sm',
		onsaved
	}: {
		citation: CitationData;
		size?: 'sm' | 'md' | 'lg';
		onsaved?: (saved: boolean) => void;
	} = $props();

	let isSaved = $state(false);
	let isSaving = $state(false);
	let savedId = $state<string | null>(null);

	const sizeClasses = $derived.by(() => {
		if (size === 'lg') return 'px-3 py-2 text-sm';
		if (size === 'md') return 'px-2 py-1.5 text-xs';
		return 'px-1.5 py-1 text-[11px]';
	});

	$effect(() => {
		if (citation.statute_code) {
			checkIfSaved(citation.statute_code);
		}
	});

	async function checkIfSaved(statuteCode: string) {
		try {
			const res = await fetch(`/api/citations/saved?statute_code=${encodeURIComponent(statuteCode)}`);
			if (res.ok) {
				const data = await res.json();
				const match = data.citations?.[0];
				if (match) {
					isSaved = true;
					savedId = match.id;
				}
			}
		} catch {
			// silent — just means we can't check
		}
	}

	async function handleToggle() {
		if (isSaving) return;
		isSaving = true;

		try {
			if (isSaved && savedId) {
				const res = await fetch(`/api/citations/saved?id=${savedId}`, { method: 'DELETE' });
				if (res.ok) {
					isSaved = false;
					savedId = null;
					onsaved?.(false);
				}
			} else {
				const res = await fetch('/api/citations/saved', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						statute_code: citation.statute_code ?? '',
						statute_title: citation.statute_title,
						jurisdiction: citation.jurisdiction,
						severity: citation.severity,
						highlighted_text: citation.highlighted_text,
						notes: citation.notes,
						case_id: citation.case_id,
						source_type: citation.source_type ?? 'manual',
					}),
				});
				if (res.ok) {
					const data = await res.json();
					isSaved = true;
					savedId = data.citation?.id ?? null;
					onsaved?.(true);
				}
			}
		} catch (err) {
			console.error('Citation save error:', err);
		} finally {
			isSaving = false;
		}
	}
</script>

<button
	onclick={handleToggle}
	disabled={isSaving}
	class="inline-flex items-center gap-1 rounded border transition-colors {sizeClasses} {isSaved ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-transparent border-sand/20 text-sand/60 hover:border-accent/30 hover:text-accent'}"
	title={isSaved ? 'Remove saved citation' : 'Save citation'}
>
	{#if isSaving}
		<Icon name="loader-2" size={14} />
	{:else if isSaved}
		<Icon name="star" size={14} />
	{:else}
		<Icon name="star" size={14} />
	{/if}
	<span>{isSaving ? 'Saving...' : isSaved ? 'Saved' : 'Save'}</span>
</button>
