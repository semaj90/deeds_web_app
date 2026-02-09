<script lang="ts">
/**
 * AIAssistantMachineComponent - Stub Component
 *
 * NOTE: This is a stub component created during Session 10 cleanup.
 * The original implementation was corrupted and archived to:
 * _archive/corrupted-files-feb-8-2026/aiAssistantMachine-*.ts
 *
 * TODO: Rebuild using XState v5 patterns from xstate-svelte5.ts helper
 */
import Button from '$lib/components/ui/Button.svelte';

let message = $state('AI Assistant temporarily unavailable during maintenance.');
let isExpanded = $state(false);
</script>

<div class="ai-assistant-stub">
	<div class="stub-header">
		<h3>AI Assistant</h3>
		<Button onclick={() => isExpanded = !isExpanded}>
			{isExpanded ? 'Hide Details' : 'Show Details'}
		</Button>
	</div>

	<div class="stub-message">
		<p>{message}</p>
	</div>

	{#if isExpanded}
		<div class="stub-details">
			<h4>Status</h4>
			<ul>
				<li>Original implementation archived during Session 10 error cleanup</li>
				<li>File had 200+ cascading TypeScript errors</li>
				<li>Requires rebuild using XState v5 patterns</li>
			</ul>

			<h4>Migration Path</h4>
			<ul>
				<li>Use <code>xstate-svelte5.ts</code> helper for Svelte 5 integration</li>
				<li>Reference <code>evidence-processing-machine.ts</code> for patterns</li>
				<li>Implement proper XState v5 setup API</li>
			</ul>

			<h4>Original Location</h4>
			<p>
				<code>_archive/corrupted-files-feb-8-2026/aiAssistantMachine-machines.ts</code><br>
				<code>_archive/corrupted-files-feb-8-2026/aiAssistantMachine-workflows.ts</code>
			</p>
		</div>
	{/if}
</div>

<style>
	.ai-assistant-stub {
		border: 2px solid #fbbf24;
		border-radius: 0.5rem;
		padding: 1.5rem;
		background: #fffbeb;
		margin: 1rem 0;
	}

	.stub-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.stub-header h3 {
		margin: 0;
		color: #92400e;
	}

	.stub-message {
		padding: 1rem;
		background: white;
		border-radius: 0.25rem;
		border-left: 4px solid #f59e0b;
	}

	.stub-message p {
		margin: 0;
		color: #78350f;
	}

	.stub-details {
		margin-top: 1rem;
		padding: 1rem;
		background: white;
		border-radius: 0.25rem;
		font-size: 0.875rem;
	}

	.stub-details h4 {
		margin: 1rem 0 0.5rem 0;
		color: #92400e;
		font-size: 1rem;
	}

	.stub-details h4:first-child {
		margin-top: 0;
	}

	.stub-details ul {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
	}

	.stub-details li {
		margin: 0.25rem 0;
		color: #78350f;
	}

	.stub-details code {
		background: #fef3c7;
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-size: 0.8125rem;
	}

	.stub-details p {
		margin: 0.5rem 0;
		line-height: 1.6;
	}
</style>
