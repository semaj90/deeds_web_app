<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

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
	<div class="p-3 border border-sand-dark rounded-lg bg-panel-soft {className}">
		<div class="flex items-center gap-1.5 mb-2 text-[13px] font-semibold">
			<Icon name="lightbulb" size={14} />
			<span class="flex-1">Suggested Actions</span>
			<button class="bg-transparent border-none text-inherit opacity-40 cursor-pointer p-0.5 hover:opacity-100" onclick={() => (dismissed = true)} aria-label="Dismiss">
				<Icon name="x" size={12} />
			</button>
		</div>
		<div class="flex flex-col gap-1">
			{#each suggestions as suggestion}
				<button
					class="flex items-center gap-2 w-full p-2 border-none rounded-md bg-transparent text-inherit cursor-pointer text-left hover:bg-white/5"
					onclick={() => handleAction(suggestion.action)}
				>
					<Icon name={suggestion.icon} size={14} />
					<div class="flex-1 flex flex-col">
						<span class="text-[13px] font-medium">{suggestion.label}</span>
						<span class="text-[11px] opacity-50">{suggestion.description}</span>
					</div>
					<Icon name="chevron-right" size={12} />
				</button>
			{/each}
		</div>
	</div>
{/if}
