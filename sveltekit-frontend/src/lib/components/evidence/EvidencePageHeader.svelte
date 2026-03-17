<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	let {
		evidenceCount = 0,
		caseId = null,
		onCreateWithAI,
		onBulkUpload,
		onAiAssistant,
		onAdvancedTools
	}: {
		evidenceCount?: number;
		caseId?: string | null;
		onCreateWithAI?: () => void;
		onBulkUpload?: () => void;
		onAiAssistant?: () => void;
		onAdvancedTools?: () => void;
	} = $props();
</script>

<header class="ev-header">
	<div class="ev-header-left">
		<div class="ev-header-icon">
			<Icon name="folder-open" class="w-6 h-6" />
		</div>
		<div>
			<h1 class="ev-title">Evidence Management</h1>
			<p class="ev-subtitle">
				{evidenceCount} item{evidenceCount !== 1 ? 's' : ''}
				{#if caseId}
					<span class="ev-case-badge">Case #{caseId.slice(0, 8)}</span>
				{/if}
			</p>
		</div>
	</div>

	<div class="ev-header-actions">
		<button type="button" class="ev-btn ev-btn-primary" onclick={onCreateWithAI}>
			<Icon name="sparkles" class="w-4 h-4" />
			Create with AI
		</button>
		<a href="/evidence/upload" class="ev-btn ev-btn-secondary">
			<Icon name="upload" class="w-4 h-4" />
			Upload
		</a>
		<button type="button" class="ev-btn ev-btn-ghost" onclick={onBulkUpload}>
			<Icon name="layers" class="w-4 h-4" />
			Bulk Upload
		</button>
		<button type="button" class="ev-btn ev-btn-ghost" onclick={onAiAssistant}>
			<Icon name="bot" class="w-4 h-4" />
			AI Tools
		</button>
		<button type="button" class="ev-btn ev-btn-ghost" onclick={onAdvancedTools}>
			<Icon name="settings" class="w-4 h-4" />
			Forensics
		</button>
	</div>
</header>

<style>
	.ev-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(255, 255, 255, 0.02);
		gap: 1rem;
		flex-wrap: wrap;
	}
	.ev-header-left {
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}
	.ev-header-icon {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		background: linear-gradient(135deg, rgba(96, 165, 250, 0.15), rgba(139, 92, 246, 0.15));
		display: flex;
		align-items: center;
		justify-content: center;
		color: #60a5fa;
	}
	.ev-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
		letter-spacing: -0.01em;
	}
	.ev-subtitle {
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.4);
		margin: 0.125rem 0 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.ev-case-badge {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.2);
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #f59e0b;
		font-family: 'JetBrains Mono', monospace;
	}
	.ev-header-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.ev-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		border-radius: 8px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		border: 1px solid transparent;
		text-decoration: none;
	}
	.ev-btn-primary {
		background: rgba(96, 165, 250, 0.15);
		color: #60a5fa;
		border-color: rgba(96, 165, 250, 0.2);
	}
	.ev-btn-primary:hover {
		background: rgba(96, 165, 250, 0.25);
	}
	.ev-btn-secondary {
		background: rgba(139, 92, 246, 0.12);
		color: #a78bfa;
		border-color: rgba(139, 92, 246, 0.2);
	}
	.ev-btn-secondary:hover {
		background: rgba(139, 92, 246, 0.22);
	}
	.ev-btn-ghost {
		background: rgba(255, 255, 255, 0.04);
		color: rgba(212, 199, 163, 0.6);
		border-color: rgba(255, 255, 255, 0.06);
	}
	.ev-btn-ghost:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(212, 199, 163, 0.9);
	}
</style>
