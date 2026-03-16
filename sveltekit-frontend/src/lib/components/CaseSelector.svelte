<script lang="ts">
	interface CaseResult {
		id: string;
		title: string;
		caseNumber?: string | null;
		status: string;
	}

	interface Props {
		onselect?: (selectedCase: CaseResult) => void;
		placeholder?: string;
		class?: string;
	}

	let { onselect, placeholder = 'Search cases...', class: className = '' }: Props = $props();

	let query = $state('');
	let results = $state<CaseResult[]>([]);
	let isLoading = $state(false);
	let isOpen = $state(false);
	let selectedCase = $state<CaseResult | null>(null);
	let highlightedIndex = $state(-1);
	let inputRef = $state<HTMLInputElement | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	function extractResults(payload: unknown): CaseResult[] {
		const data = payload as {
			data?: CaseResult[] | { cases?: CaseResult[] };
			cases?: CaseResult[];
		};

		if (Array.isArray(data?.data)) return data.data;
		if (Array.isArray(data?.data?.cases)) return data.data.cases;
		if (Array.isArray(data?.cases)) return data.cases;
		return [];
	}

	async function search(term: string) {
		if (!term.trim()) {
			results = [];
			isOpen = false;
			return;
		}
		isLoading = true;
		try {
			const res = await fetch(`/api/cases?search=${encodeURIComponent(term)}&limit=10`);
			if (!res.ok) throw new Error('Search failed');
			const data = await res.json();
			results = extractResults(data);
			isOpen = results.length > 0;
			highlightedIndex = -1;
		} catch {
			results = [];
		} finally {
			isLoading = false;
		}
	}

	function handleInput(e: Event) {
		query = (e.target as HTMLInputElement).value;
		selectedCase = null;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => search(query), 250);
	}

	function selectCase(c: CaseResult) {
		selectedCase = c;
		query = c.title;
		isOpen = false;
		onselect?.(c);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!isOpen) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlightedIndex = Math.min(highlightedIndex + 1, results.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightedIndex = Math.max(highlightedIndex - 1, 0);
		} else if (e.key === 'Enter' && highlightedIndex >= 0) {
			e.preventDefault();
			selectCase(results[highlightedIndex]);
		} else if (e.key === 'Escape') {
			isOpen = false;
		}
	}

	function clear() {
		query = '';
		selectedCase = null;
		results = [];
		isOpen = false;
		inputRef?.focus();
	}
</script>

<div class="case-selector {className}">
	<div class="input-wrapper">
		<input
			type="text"
			value={query}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onfocus={() => {
				if (results.length > 0) isOpen = true;
			}}
			onblur={() => setTimeout(() => { isOpen = false; }, 200)}
			{placeholder}
			bind:this={inputRef}
			autocomplete="off"
		/>
		{#if isLoading}
			<span class="spinner"></span>
		{:else if selectedCase}
			<button class="clear-btn" type="button" onclick={clear}>x</button>
		{/if}
	</div>

	{#if isOpen}
		<ul class="results-dropdown" role="listbox">
			{#each results as c, idx (c.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
			<li
					role="option"
					aria-selected={idx === highlightedIndex}
					class="result-item"
					class:highlighted={idx === highlightedIndex}
					onclick={() => selectCase(c)}
					onmouseenter={() => { highlightedIndex = idx; }}
				>
					<span class="case-title">{c.title}</span>
					{#if c.caseNumber}
						<span class="case-number">#{c.caseNumber}</span>
					{/if}
					<span class="case-status">{c.status}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.case-selector {
		position: relative;
	}

	.input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.input-wrapper input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		padding-right: 2rem;
		border: 1px solid #d4a574;
		border-radius: 6px;
		background: white;
		color: #2c2c2c;
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.2s;
	}

	.input-wrapper input:focus {
		border-color: #8b4513;
		box-shadow: 0 0 0 2px rgba(139, 69, 19, 0.15);
	}

	.spinner {
		position: absolute;
		right: 0.75rem;
		width: 14px;
		height: 14px;
		border: 2px solid #d4a574;
		border-top-color: #8b4513;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.clear-btn {
		position: absolute;
		right: 0.5rem;
		background: none;
		border: none;
		color: #999;
		cursor: pointer;
		font-size: 1rem;
		padding: 0.25rem;
		line-height: 1;
	}

	.clear-btn:hover {
		color: #8b4513;
	}

	.results-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 100;
		margin-top: 4px;
		padding: 0;
		list-style: none;
		background: #f5f1e8;
		border: 1px solid #d4a574;
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		max-height: 240px;
		overflow-y: auto;
	}

	.result-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		transition: background 0.15s;
	}

	.result-item:hover,
	.result-item.highlighted {
		background: #e8dfd0;
	}

	.case-title {
		flex: 1;
		font-size: 0.875rem;
		color: #2c2c2c;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.case-number {
		font-size: 0.75rem;
		color: #8b4513;
		font-family: monospace;
	}

	.case-status {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.15rem 0.4rem;
		border-radius: 3px;
		background: #e8dfd0;
		color: #666;
	}
</style>
