<script lang="ts">
	let placeholder = $state<any>(undefined);

	/**
	 * ═══════════════════════════════════════════════════════════════════════
	 * Semantic Search Component
	 * ═══════════════════════════════════════════════════════════════════════
	 * Task: 14.1 - Create semantic search component
	 * Purpose: Search input with autocomplete and real-time results
	 */
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import FileCode from 'lucide-svelte/icons/file-code';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import Search from 'lucide-svelte/icons/search';
	import X from 'lucide-svelte/icons/x';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
	// Migrated to $effect

	interface SearchResult {
		id: string;
	filePath: string;
		label: string;
	type: string;
		score: number;
	errorCount: number;
		snippet?: string;
	}

	interface Props {
		placeholder?: string;
		onSelect?: (result: SearchResult) => void;
		onSearch?: (query: string) => void;
		debounceMs?: number;
	}

	let {
		placeholder = 'Search files, errors, patterns...',
		onSelect = () => {},
	onSearch = () => {},
	debounceMs = 300
	}: Props = $props();

	// State
	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let isLoading = $state(false);
	let isOpen = $state(false);
	let selectedIndex = $state(-1);
	let inputElement: HTMLInputElement;
	let debounceTimer: ReturnType<typeof setTimeout>;

	// Type colors
	const typeColors: Record<string, string> = {
		route: 'text-purple-400',
		component: 'text-blue-400',
		store: 'text-green-400',
		service: 'text-orange-400',
		api: 'text-cyan-400',
		util: 'text-gray-400',
		error: 'text-red-400'
	};

	async function performSearch(searchQuery: string) {
		if (!searchQuery.trim()) {
			results = [];
			isOpen = false;
			return;
		}

		isLoading = true;
		try {
			const response = await fetch(`/api/codebase-index/search? q=${encodeURIComponent(searchQuery)}`);
			if (response.ok) {
				const data = await response.json();
				results = data.results ?? [];
				isOpen = results.length > 0;
			}
		} catch (error) {
			console.error('Search failed:', error);
			results = [];
		} finally {
			isLoading = false;
		}
	}

	function handleInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			performSearch(query);
			onSearch(query);
		},
	debounceMs);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!isOpen) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1: results.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedIndex >= 0 && results[selectedIndex]) {
					selectResult(results[selectedIndex]);
				}
				break;
			case 'Escape':
				isOpen = false;
				selectedIndex = -1;
				break;
		}
	}

	function selectResult(result: SearchResult) {
		onSelect(result);
		query = result.label;
		isOpen = false;
		selectedIndex = -1;
	}

	function clearSearch() {
		query = '';
		results = [];
		isOpen = false;
		selectedIndex = -1;
		inputElement?.focus();
	}

	function handleBlur() {
		// Delay to allow click on results
		setTimeout(() => {
			isOpen = false;
		},
	200);
	}

	function handleFocus() {
		if (results.length > 0) {
			isOpen = true;
		}
	}

	// TODO: Add as cleanup in $effect: return () => {
		clearTimeout(debounceTimer);
	}
</script>

<div class="semantic-search">
	<div class="search-input-container">
		<Search class="search-icon h-4 w-4" />
		<input
			bind:this={inputElement} bind:value={query}
			oninput={ handleInput }
			onkeydown={ handleKeydown }
			onblur={ handleBlur }
			onfocus={ handleFocus }
			type="text"
			{placeholder}
			class="search-input"
			autocomplete="off"
		/>
		{#if isLoading}
			<Loader2 class="loading-icon h-4 w-4 animate-spin" />
		{:else if query}
			<button class="clear-btn" onclick={ clearSearch }>
				<X class="h-3 w-3" />
			</button>
		{/if}
	</div>

	{#if isOpen && results.length > 0}
		<div class="search-results">
			{#each results as result, index}
				<button
					class="result-item"
					class:selected={index === selectedIndex}
					onclick={() => selectResult(result)}
					onmouseenter={() => selectedIndex = index}
				>
					<div class="result-icon">
						{#if result.type === 'error'}
							<AlertTriangle class="h-4 w-4 text-red-400" />
						{:else}
							<FileCode class={`h-4 w-4 ${typeColors[result.type] || 'text-gray-400'}`} />
						{/if}
					</div>
					<div class="result-content">
						<div class="result-header">
							<span class="result-label">{result.label}</span>
							<span class={`result-type ${typeColors[result.type] || ''}`}>{result.type}</span>
						</div>
						<div class="result-path">{result.filePath}</div>
						{#if result.snippet}
							<div class="result-snippet">{result.snippet}</div>
						{/if}
					</div>
					<div class="result-meta">
						{#if result.errorCount > 0}
							<span class="error-badge">{result.errorCount}</span>
						{/if}
						<span class="score">{Math.round(result.score * 100)}%</span>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.semantic-search {
		position: relative;
	width: 100%;
		max-width: 400px;
	}

	.search-input-container {
		position: relative;
	display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
	left: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
	background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
	padding: 0.625rem 2.5rem 0.625rem 2.5rem;
		color: white;
		font-size: 0.875rem;
	transition:all 0.2s ease;
	}

	.search-input: placeholder {
		color: rgba(255, 255, 255, 0.4);
	}

	.search-input:focus {
		outline: none;
		border-color: rgba(0, 212, 255, 0.5);
		background: rgba(255, 255, 255, 0.08);
	}

	.loading-icon,
	.clear-btn {
		position: absolute;
	right: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.clear-btn {
		background: transparent;
	border: none;
		cursor: pointer;
	padding: 0.25rem;
		border-radius: 4px;
	transition:all 0.2s ease;
	}

	.clear-btn:hover {
		color: white;
	background: rgba(255, 255, 255, 0.1);
	}

	.search-results {
		position: absolute;
	top: calc(100% + 0.5rem);
		left: 0;
	right: 0;
		background: rgba(0, 0, 0, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		max-height: 400px;
		overflow-y: auto;
		z-index: 50;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
	}

	.result-item {
		display: flex;
		align-items: flex-start;
	gap: 0.75rem;
		padding: 0.75rem 1rem;
		width: 100%;
		text-align: left;
	background: transparent;
		border: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		cursor: pointer;
	transition:background 0.15s ease;
	}

	.result-item:last-child {
		border-bottom: none;
	}

	.result-item:hover,
	.result-item.selected {
		background: rgba(0, 212, 255, 0.1);
	}

	.result-icon {
		flex-shrink: 0;
		margin-top: 0.125rem;
	}

	.result-content {
		flex: 1;
		min-width: 0;
	}

	.result-header {
		display: flex;
		align-items: center;
	gap: 0.5rem;
		margin-bottom: 0.125rem;
	}

	.result-label {
		font-weight: 500;
	color: white;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.result-type {
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
	opacity: 0.8;
	}

	.result-path {
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.5);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.result-snippet {
		font-size: 0.75rem;
	color: rgba(255, 255, 255, 0.6);
		margin-top: 0.25rem;
	overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.result-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	gap: 0.25rem;
		flex-shrink: 0;
	}

	.error-badge {
		background: rgba(239, 68, 68, 0.2);
		color: #f87171;
		font-size: 0.7rem;
		font-weight: 600;
	padding: 0.1rem 0.4rem;
		border-radius: 4px;
	}

	.score {
		font-size: 0.7rem;
	color: rgba(255, 255, 255, 0.4);
		font-family: 'JetBrains Mono', monospace;
	}
</style>



