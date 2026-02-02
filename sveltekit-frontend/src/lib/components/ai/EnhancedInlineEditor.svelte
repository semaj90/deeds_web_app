<script lang="ts">
	import { debounce } from 'lodash-es';
	import { tick } from 'svelte';

	// Props using Svelte 5 $props()
	let {
		value = $bindable(''),
		placeholder = 'Start typing to get AI suggestions...',
		aiModel = 'gemma3-legal',
		enableAutoComplete = true,
		enableGrammarCheck = true,
		enableSemanticSuggestions = true,
		minCharactersForSuggestion = 10,
		suggestionDelay = 800,
		maxSuggestions = 3,
		class: className = ''
	}: {
		value?: string;
		placeholder?: string;
		aiModel?: string;
		enableAutoComplete?: boolean;
		enableGrammarCheck?: boolean;
		enableSemanticSuggestions?: boolean;
		minCharactersForSuggestion?: number;
		suggestionDelay?: number;
		maxSuggestions?: number;
		class?: string;
	} = $props();

	// AI suggestion types
	interface AISuggestion {
		id: string;
		type: 'completion' | 'grammar' | 'semantic' | 'legal_term';
		text: string;
		replacement?: string;
		confidence: number;
		reasoning: string;
		range?: {
			start: number;
			end: number;
		};
	}

	// State management using Svelte 5 runes
	let editorElement = $state<HTMLDivElement | undefined>();
	let suggestionPopup = $state<HTMLDivElement | undefined>();
	let isShowingSuggestions = $state(false);
	let currentSuggestions = $state<AISuggestion[]>([]);
	let selectedSuggestionIndex = $state(-1);
	let cursorPosition = $state({ x: 0, y: 0 });
	let isProcessing = $state(false);
	let lastProcessedText = $state('');

	// Debounced suggestion generation
	const generateSuggestions = debounce(async (text: string, cursorPos: number) => {
		if (text.length < minCharactersForSuggestion || text === lastProcessedText) {
			return;
		}

		lastProcessedText = text;
		isProcessing = true;

		try {
			// Get context around cursor
			const contextBefore = text.slice(Math.max(0, cursorPos - 100), cursorPos);
			const contextAfter = text.slice(cursorPos, Math.min(text.length, cursorPos + 50));

			// Generate AI suggestions
			const suggestions = await generateAISuggestions({
				text,
				contextBefore,
				contextAfter,
				cursorPosition: cursorPos
			});

			currentSuggestions = suggestions.slice(0, maxSuggestions);

			if (currentSuggestions.length > 0) {
				await tick();
				updateSuggestionPopupPosition();
				isShowingSuggestions = true;
				selectedSuggestionIndex = 0;
			}
		} catch (error) {
			console.error('Failed to generate AI suggestions:', error);
		} finally {
			isProcessing = false;
		}
	}, suggestionDelay);

	// Generate AI suggestions using multiple techniques
	async function generateAISuggestions(context: {
		text: string;
		contextBefore: string;
		contextAfter: string;
		cursorPosition: number;
	}): Promise<AISuggestion[]> {
		const suggestions: AISuggestion[] = [];

		// TODO: Implement actual AI suggestions via API
		// For now, return empty array to avoid errors
		console.log('AI suggestions context:', context);

		return suggestions;
	}

	// Update suggestion popup position
	function updateSuggestionPopupPosition() {
		if (!suggestionPopup || !editorElement) return;

		const rect = editorElement.getBoundingClientRect();
		cursorPosition = {
			x: rect.left,
			y: rect.bottom
		};
	}

	// Handle input changes
	function handleInput(event: Event) {
		const target = event.target as HTMLDivElement;
		value = target.textContent || '';
		generateSuggestions(value, value.length);
	}

	// Apply suggestion
	function applySuggestion(suggestion: AISuggestion) {
		if (suggestion.replacement) {
			value = suggestion.replacement;
		} else {
			value += suggestion.text;
		}
		isShowingSuggestions = false;
		currentSuggestions = [];
	}

	// Keyboard navigation
	function handleKeyDown(event: KeyboardEvent) {
		if (!isShowingSuggestions) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedSuggestionIndex = Math.min(
					selectedSuggestionIndex + 1,
					currentSuggestions.length - 1
				);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedSuggestionIndex >= 0) {
					applySuggestion(currentSuggestions[selectedSuggestionIndex]);
				}
				break;
			case 'Escape':
				event.preventDefault();
				isShowingSuggestions = false;
				break;
		}
	}
</script>

<div class="enhanced-inline-editor {className}">
	<div
		bind:this={editorElement}
		contenteditable="true"
		role="textbox"
		tabindex="0"
		class="editor-content"
		{placeholder}
		oninput={handleInput}
		onkeydown={handleKeyDown}
	>
		{value}
	</div>

	{#if isProcessing}
		<div class="processing-indicator">
			<span class="spinner"></span>
			Generating suggestions...
		</div>
	{/if}

	{#if isShowingSuggestions && currentSuggestions.length > 0}
		<div
			bind:this={suggestionPopup}
			class="suggestion-popup"
			style="left: {cursorPosition.x}px; top: {cursorPosition.y}px;"
		>
			{#each currentSuggestions as suggestion, index}
				<button
					class="suggestion-item"
					class:selected={index === selectedSuggestionIndex}
					onclick={() => applySuggestion(suggestion)}
					type="button"
				>
					<div class="suggestion-type">{suggestion.type}</div>
					<div class="suggestion-text">{suggestion.text}</div>
					<div class="suggestion-confidence">{Math.round(suggestion.confidence * 100)}%</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.enhanced-inline-editor {
		position: relative;
		width: 100%;
	}

	.editor-content {
		min-height: 100px;
		padding: 0.75rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		outline: none;
		transition:border-color 0.2s;
	}

	.editor-content:focus {
		border-color: #3b82f6;
	}

	.editor-content:empty:before {
		content: attr(placeholder);
		color: #9ca3af;
	}

	.processing-indicator {
		position: absolute;
		bottom: 0.5rem;
		right: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #6b7280;
	}

	.spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.suggestion-popup {
		position: fixed;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
		padding: 0.5rem;
		z-index: 50;
		max-width: 300px;
	}

	.suggestion-item {
		display: block;
		width: 100%;
		padding: 0.5rem;
		text-align: left;
		border: none;
		background: none;
		cursor: pointer;
		border-radius: 0.25rem;
		transition:background-color 0.2s;
	}

	.suggestion-item:hover,
	.suggestion-item.selected {
		background-color: #f3f4f6;
	}

	.suggestion-type {
		font-size: 0.75rem;
		color: #6b7280;
		text-transform: uppercase;
	}

	.suggestion-text {
		margin-top: 0.25rem;
		font-size: 0.875rem;
	}

	.suggestion-confidence {
		margin-top: 0.25rem;
		font-size: 0.75rem;
		color: #3b82f6;
	}
</style>






