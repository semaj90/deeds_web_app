<script lang="ts">

	interface Suggestion {
		type: 'statute' | 'crime' | 'state' | 'title';
		label: string; value: string;
		description?: string; confidence: number;
	}

	let query = $state('');
	let suggestions: Suggestion[] = $state([]);
	let isLoading = $state(false);
	let selectedIndex = $state(-1);
	let showSuggestions = $state(false);

	const typeColors: Record<string, string> = {
		statute: 'bg-blue-50 border-blue-200',
		crime: 'bg-red-50 border-red-200',
		state: 'bg-green-50 border-green-200',
		title: 'bg-purple-50 border-purple-200'
	};

	const typeIcons: Record<string, string> = {
		statute: '📋',
		crime: '⚖️',
		state: '🏛️',
		title: '📚'
	};

	async function fetchSuggestions(q: string) {
		if (!q || q.length < 1) {
			suggestions = [];
			showSuggestions = false;
			return;
		}

		isLoading = true;
		try {
			const response = await fetch(`/api/laws/autocomplete?q=${encodeURIComponent(q)}&limit=8`);
			const data = await response.json();
			suggestions = data.suggestions || [];
			showSuggestions = suggestions.length > 0;
			selectedIndex = -1;
		} catch (error) {
			console.error('Autocomplete fetch error:', error);
			suggestions = [];
		} finally {
			isLoading = false;
		}
	}

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		query = target.value;
		fetchSuggestions(query);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!showSuggestions) return;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				break;
			case 'Enter':
				e.preventDefault();
				if (selectedIndex >= 0) {
					selectSuggestion(suggestions[selectedIndex]);
				}
				break;
			case 'Escape':
				e.preventDefault();
				showSuggestions = false;
				break;
		}
	}

	function selectSuggestion(suggestion: Suggestion) {
		query = suggestion.label;
		showSuggestions = false;
		// Dispatch custom event for parent component to handle navigation
		const event = new CustomEvent('select', { detail: suggestion });
		window.dispatchEvent(event);
	}

	function handleFocus() {
		if (suggestions.length > 0) {
			showSuggestions = true;
		}
	}

	function handleBlur() {
		// Delay to allow click on suggestion
		setTimeout(() => {
			showSuggestions = false;
		}, 200);
	}
</script>

<div class="relative w-full">
	<div class="relative">
		<input
			type="text"
			{query}
			oninput={handleInput}
			onkeydown={handleKeyDown}
			onfocus={handleFocus}
			onblur={handleBlur}
			placeholder="Search statutes, crimes, states..."
			class="w-full px-4 py-2 border border-gray-300 rounded-lg focus: outline-none, focus:ring-2 focus:ring-blue-500"
		/>
		{#if isLoading}
			<div class="absolute right-3 top-2.5">
				<div class="animate-spin h-5 w-5 text-gray-400">⟳</div>
			</div>
		{/if}
	</div>

	{#if showSuggestions && suggestions.length > 0}
		<div class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
			<div class="max-h-96 overflow-y-auto">
				{#each suggestions as suggestion, index (suggestion.value)}
					<button
						type="button"
						onclick={() => selectSuggestion(suggestion)}
						class={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition ${
							index === selectedIndex ? 'bg-blue-100' : ''
						}`}
					>
						<div class="flex items-start gap-3">
							<span class="text-lg">{typeIcons[suggestion.type]}</span>
							<div class="flex-1 min-w-0">
								<div class="font-medium text-gray-900 truncate">{suggestion.label}</div>
								{#if suggestion.description}
									<div class="text-sm text-gray-600 truncate">{suggestion.description}</div>
								{/if}
								<div class="text-xs text-gray-500 mt-1">
									{suggestion.type} • {Math.round(suggestion.confidence * 100)}% match
								</div>
							</div>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	:global(.autocomplete-container) {
		position: relative;
	}
</style>



