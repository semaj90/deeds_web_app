<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Suggestion {
		id: string;
		label: string;
		description: string;
		icon: string;
		action: string;
	}

	interface Props {
		context?: string;
		caseId?: string;
		onaction?: (action: string) => void;
		class?: string;
	}

	let {
		context = 'general',
		caseId,
		onaction,
		class: className = ''
	}: Props = $props();

	let suggestions = $state<Suggestion[]>([]);
	let loading = $state(false);
	let dismissed = $state(false);

	$effect(() => {
		generateSuggestions();
	});

	function generateSuggestions() {
		// Context-aware suggestions based on current page/case state
		const contextSuggestions: Record<string, Suggestion[]> = {
			general: [
				{ id: 'new-case', label: 'Create New Case', description: 'Start a guided case intake workflow', icon: 'plus-circle', action: 'new-case' },
				{ id: 'search', label: 'Search Evidence', description: 'Search across all evidence and documents', icon: 'search', action: 'search-evidence' },
				{ id: 'recent', label: 'View Recent Cases', description: 'See your most recent case activity', icon: 'clock', action: 'recent-cases' }
			],
			case: [
				{ id: 'analyze', label: 'Analyze Evidence', description: 'Run AI analysis on case evidence', icon: 'brain', action: 'analyze-evidence' },
				{ id: 'timeline', label: 'Build Timeline', description: 'Generate a case event timeline', icon: 'calendar', action: 'build-timeline' },
				{ id: 'precedents', label: 'Find Precedents', description: 'Search for relevant legal precedents', icon: 'scale', action: 'find-precedents' },
				{ id: 'report', label: 'Generate Report', description: 'Create a comprehensive case report', icon: 'file-text', action: 'generate-report' }
			],
			evidence: [
				{ id: 'upload', label: 'Upload Evidence', description: 'Add new evidence to the system', icon: 'upload', action: 'upload-evidence' },
				{ id: 'entities', label: 'Extract Entities', description: 'Run entity extraction on selected items', icon: 'tag', action: 'extract-entities' },
				{ id: 'similar', label: 'Find Similar', description: 'Search for semantically similar evidence', icon: 'git-branch', action: 'find-similar' }
			]
		};

		suggestions = contextSuggestions[context] ?? contextSuggestions.general;
	}

	function handleAction(action: string) {
		onaction?.(action);
	}
</script>

{#if !dismissed && suggestions.length > 0}
	<div class="proactive-assistant {className}">
		<div class="assistant-header">
			<Icon name="lightbulb" size={14} />
			<span class="header-text">Suggested Actions</span>
			<button class="dismiss-btn" onclick={() => (dismissed = true)} aria-label="Dismiss">
				<Icon name="x" size={12} />
			</button>
		</div>
		<div class="suggestion-list">
			{#each suggestions as suggestion}
				<button
					class="suggestion-item"
					onclick={() => handleAction(suggestion.action)}
				>
					<Icon name={suggestion.icon} size={14} />
					<div class="suggestion-text">
						<span class="suggestion-label">{suggestion.label}</span>
						<span class="suggestion-desc">{suggestion.description}</span>
					</div>
					<Icon name="chevron-right" size={12} />
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.proactive-assistant {
		padding: 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		background: var(--color-panel-soft, #1c1917);
	}
	.assistant-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.header-text {
		flex: 1;
	}
	.dismiss-btn {
		background: none;
		border: none;
		color: inherit;
		opacity: 0.4;
		cursor: pointer;
		padding: 0.125rem;
	}
	.dismiss-btn:hover {
		opacity: 1;
	}
	.suggestion-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.suggestion-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem;
		border: none;
		border-radius: 0.375rem;
		background: transparent;
		color: inherit;
		cursor: pointer;
		text-align: left;
		transition: background-color 0.15s;
	}
	.suggestion-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.suggestion-text {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
	.suggestion-label {
		font-size: 0.8125rem;
		font-weight: 500;
	}
	.suggestion-desc {
		font-size: 0.6875rem;
		opacity: 0.5;
	}
</style>
