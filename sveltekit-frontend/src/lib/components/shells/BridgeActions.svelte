<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { goto } from '$app/navigation';

	interface BridgeAction {
		label: string;
		icon: string;
		description: string;
		action: () => void;
	}

	interface Props {
		/** Where is the user now — determines which bridge actions to show */
		context: 'research' | 'investigation';
		/** Optional: pre-fill a search query in the target mode */
		searchQuery?: string;
		/** Optional: evidence ID to link from investigation → research */
		evidenceId?: string;
		/** Optional: document/statute ID to link from research → investigation */
		documentId?: string;
		/** Optional: case ID for case-scoped actions */
		caseId?: string;
		/** Compact mode — icon-only buttons */
		compact?: boolean;
	}

	let {
		context,
		searchQuery = '',
		evidenceId = '',
		documentId = '',
		caseId = '',
		compact = false,
	}: Props = $props();

	// Bridge actions from Investigation → Research
	const investigationActions: BridgeAction[] = [
		{
			label: 'Query Legal DB',
			icon: 'search',
			description: 'Search statutes, case law, and regulations',
			action: () => {
				const q = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
				goto(`/library${q}`);
			},
		},
		{
			label: 'Open Cited Statute',
			icon: 'scale',
			description: 'View the full text of a cited statute',
			action: () => {
				if (documentId) {
					goto(`/library/${documentId}`);
				} else {
					goto('/library');
				}
			},
		},
		{
			label: 'View Precedent',
			icon: 'book-open',
			description: 'Read case precedent in the legal reader',
			action: () => {
				goto('/library/glossary');
			},
		},
	];

	// Bridge actions from Research → Investigation
	const researchActions: BridgeAction[] = [
		{
			label: 'Attach to Evidence',
			icon: 'link',
			description: 'Link this document to an evidence item',
			action: () => {
				const params = new URLSearchParams();
				if (documentId) params.set('linkDoc', documentId);
				if (caseId) params.set('caseId', caseId);
				goto(`/evidence?${params.toString()}`);
			},
		},
		{
			label: 'Add to Case Theory',
			icon: 'lightbulb',
			description: 'Add this citation to a case analysis',
			action: () => {
				if (caseId) {
					goto(`/cases/${caseId}`);
				} else {
					goto('/cases');
				}
			},
		},
		{
			label: 'Open Investigation',
			icon: 'fingerprint',
			description: 'Switch to the evidence workspace',
			action: () => {
				goto('/evidence');
			},
		},
	];

	let actions = $derived(context === 'investigation' ? investigationActions : researchActions);
</script>

{#if compact}
	<div class="bridge-compact">
		{#each actions as act}
			<button
				class="bridge-icon-btn"
				onclick={act.action}
				title={act.description}
			>
				<Icon name={act.icon} size={14} />
			</button>
		{/each}
	</div>
{:else}
	<div class="bridge-actions" class:research-context={context === 'research'} class:inv-context={context === 'investigation'}>
		<div class="bridge-label">
			<Icon name="arrow-left-right" size={12} />
			<span>{context === 'investigation' ? 'Legal Research' : 'Investigation'}</span>
		</div>
		{#each actions as act}
			<button class="bridge-btn" onclick={act.action}>
				<Icon name={act.icon} size={14} />
				<div class="bridge-btn-text">
					<span class="bridge-btn-label">{act.label}</span>
					<span class="bridge-btn-desc">{act.description}</span>
				</div>
			</button>
		{/each}
	</div>
{/if}

<style>
	/* ─── Compact Mode ─── */
	.bridge-compact {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.bridge-icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: none;
		border: 1px solid transparent;
		color: inherit;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s ease;
		opacity: 0.6;
	}

	.bridge-icon-btn:hover {
		opacity: 1;
		border-color: currentColor;
		background: rgba(128, 128, 128, 0.1);
	}

	/* ─── Full Mode ─── */
	.bridge-actions {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem;
		border-radius: 0.5rem;
	}

	.bridge-actions.research-context {
		background: #f5f3ef;
		border: 1px solid #e5e2da;
	}

	.bridge-actions.inv-context {
		background: #242424;
		border: 1px solid #333;
	}

	.bridge-label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0.25rem 0.5rem;
		margin-bottom: 0.25rem;
	}

	.research-context .bridge-label {
		color: #8a8a8a;
	}

	.inv-context .bridge-label {
		color: #8a8272;
	}

	.bridge-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: none;
		border: none;
		cursor: pointer;
		border-radius: 0.375rem;
		text-align: left;
		transition: background 0.15s ease;
	}

	.research-context .bridge-btn {
		color: #5a5a5a;
	}

	.research-context .bridge-btn:hover {
		background: #e5e2da;
		color: #1a1a1a;
	}

	.inv-context .bridge-btn {
		color: #a89f7c;
	}

	.inv-context .bridge-btn:hover {
		background: #333;
		color: #e8e0cc;
	}

	.bridge-btn-text {
		display: flex;
		flex-direction: column;
	}

	.bridge-btn-label {
		font-size: 0.75rem;
		font-weight: 500;
	}

	.bridge-btn-desc {
		font-size: 0.625rem;
		opacity: 0.6;
	}
</style>
