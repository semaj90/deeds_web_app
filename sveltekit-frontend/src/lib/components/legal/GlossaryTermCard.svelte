<script lang="ts">
	type GlossaryTerm = {
		id: string;
		term: string;
		definition: string;
		category?: string | null;
		jurisdiction?: string | null;
		relatedTerms?: string[];
		sources?: string[];
	};

	let {
		term,
		selected = false,
		variant = 'dark',
		onSelect,
	}: {
		term: GlossaryTerm;
		selected?: boolean;
		variant?: 'dark' | 'light';
		onSelect?: (id: string) => void;
	} = $props();

	const categoryLabels: Record<string, string> = {
		civil: 'Civil Law',
		constitutional: 'Constitutional',
		criminal: 'Criminal Law',
		evidence: 'Evidence',
		general: 'General',
		procedure: 'Procedure',
		uncategorized: 'Other',
	};

	function cardClass() {
		if (variant === 'light') {
			return [
				'w-full rounded-2xl border p-4 text-left transition',
				selected
					? 'border-blue-300 bg-blue-50 shadow-sm'
					: 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50',
			].join(' ');
		}

		return [
			'w-full rounded-2xl border p-4 text-left transition',
			selected
				? 'border-blue-400/30 bg-white/10 shadow-lg shadow-black/10'
				: 'border-white/8 bg-white/[0.03] hover:border-white/14 hover:bg-white/[0.05]',
		].join(' ');
	}

	function badgeClass() {
		return variant === 'light'
			? 'shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600'
			: 'badge shrink-0 text-[10px] text-zinc-300';
	}

	function titleClass() {
		return variant === 'light' ? 'truncate text-sm font-semibold text-slate-900' : 'truncate text-sm font-semibold text-white';
	}

	function bodyClass() {
		return variant === 'light'
			? 'mt-2 line-clamp-2 text-xs leading-5 text-slate-500'
			: 'mt-2 line-clamp-2 text-xs leading-5 text-zinc-400';
	}

	function metaClass() {
		return variant === 'light'
			? 'mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500'
			: 'mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500';
	}
</script>

<button type="button" class={cardClass()} onclick={() => onSelect?.(term.id)}>
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class={titleClass()}>{term.term}</p>
			<p class={bodyClass()}>{term.definition}</p>
		</div>
		<span class={badgeClass()}>
			{categoryLabels[term.category ?? 'general'] ?? 'General'}
		</span>
	</div>

	<div class={metaClass()}>
		<span>{term.jurisdiction ?? 'Federal/State'}</span>
		<span>•</span>
		<span>{term.relatedTerms?.length ?? 0} related</span>
		<span>•</span>
		<span>{term.sources?.length ?? 0} sources</span>
	</div>
</button>