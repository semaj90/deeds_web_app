<script lang="ts">
	import { fade, slide } from 'svelte/transition';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		enabled?: boolean;
		loading?: boolean;
		premium?: boolean;
		size?: 'sm' | 'md' | 'lg';
		ontoggle?: (event: { enabled: boolean }) => void;
		onconfigure?: () => void;
		onupgrade?: () => void;
	}

	let {
		enabled = $bindable(false),
		loading = false,
		premium = true,
		size = 'md',
		ontoggle,
		onconfigure,
		onupgrade
	}: Props = $props();

	let showTooltip = $state(false);
	let showConfig = $state(false);
	let thinkingDepth = $state('detailed');
	let focusAreas = $state({
		precedents: true,
		evidence: true,
		compliance: true,
		alternatives: false
	});

	let iconSize = $derived(size === 'sm' ? 16 : size === 'md' ? 20 : 24);
	let btnSize = $derived.by(() => {
		if (size === 'sm') return 'sm' as const;
		if (size === 'lg') return 'lg' as const;
		return 'md' as const;
	});

	function handleToggle() {
		if (!premium) {
			onupgrade?.();
			return;
		}
		enabled = !enabled;
		ontoggle?.({ enabled });
	}

	function handleConfigure() {
		if (!premium) return;
		showConfig = !showConfig;
		onconfigure?.();
	}
</script>

<div class="thinking-style-control">
	<div
		class="toggle-container"
		onmouseenter={() => (showTooltip = true)}
		onmouseleave={() => (showTooltip = false)}
		role="group"
	>
		<Button
			size={btnSize}
			disabled={loading || (!premium && !enabled)}
			onclick={handleToggle}
			class="thinking-toggle-btn"
		>
			<span class="icon-container">
				{#if loading}
					<span class="loading-spinner"></span>
				{:else if enabled}
					<Icon name="brain" size={iconSize} />
				{:else}
					<Icon name="zap" size={iconSize} />
				{/if}
			</span>
			<span class="toggle-text">
				{#if loading}
					Analyzing...
				{:else if enabled}
					Thinking Style
				{:else}
					Quick Mode
				{/if}
			</span>
		</Button>

		{#if premium}
			<Button variant="ghost" size="sm" onclick={handleConfigure} disabled={loading} class="ml-2">
				<Icon name="settings" size={14} />
			</Button>
		{/if}

		{#if !premium}
			<Button variant="ghost" size="sm" onclick={() => onupgrade?.()} class="ml-2">
				<Icon name="info" size={14} />
			</Button>
		{/if}

		<!-- Tooltip -->
		{#if showTooltip}
			<div class="tooltip" transition:fade={{ duration: 200 }}>
				{#if !premium}
					<div class="tooltip-content">
						<Icon name="crown" size={16} />
						<div>
							<strong>Premium Feature</strong>
							<p>Thinking Style requires Premium access for advanced AI reasoning</p>
						</div>
					</div>
				{:else if enabled}
					<div class="tooltip-content">
						<Icon name="brain" size={16} />
						<div>
							<strong>Thinking Style Active</strong>
							<p>AI shows step-by-step reasoning process</p>
							<div class="feature-list">
								<span class="feature">Deeper legal analysis</span>
								<span class="feature">Transparent reasoning</span>
								<span class="feature">Higher accuracy</span>
								<span class="feature">Detailed explanations</span>
							</div>
						</div>
					</div>
				{:else}
					<div class="tooltip-content">
						<Icon name="zap" size={16} />
						<div>
							<strong>Quick Mode Active</strong>
							<p>Fast AI responses without reasoning details</p>
							<div class="feature-list">
								<span class="feature">Instant results</span>
								<span class="feature">Concise answers</span>
								<span class="feature">Lower resource usage</span>
								<span class="feature">Basic analysis</span>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Configuration Panel -->
	{#if showConfig && premium}
		<div class="config-panel" transition:slide={{ duration: 300 }}>
			<div class="config-header">
				<h4>Thinking Style Configuration</h4>
				<p class="config-subtitle">Customize AI reasoning parameters</p>
			</div>

			<div class="config-content">
				<div class="setting-group">
					<label for="thinking-depth" class="setting-label">Reasoning Depth</label>
					<select id="thinking-depth" bind:value={thinkingDepth} class="setting-select">
						<option value="basic">Basic (3-5 steps)</option>
						<option value="detailed">Detailed (5-10 steps)</option>
						<option value="comprehensive">Comprehensive (10+ steps)</option>
					</select>
				</div>

				<div class="setting-group">
					<label class="setting-label">Focus Areas</label>
					<div class="checkbox-group">
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={focusAreas.precedents} />
							<span>Legal precedents & case law</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={focusAreas.evidence} />
							<span>Evidence quality assessment</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={focusAreas.compliance} />
							<span>Procedural compliance</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={focusAreas.alternatives} />
							<span>Alternative interpretations</span>
						</label>
					</div>
				</div>
			</div>

			<div class="config-actions">
				<Button variant="ghost" size="sm" onclick={() => (showConfig = false)}>Cancel</Button>
				<Button size="sm" onclick={() => (showConfig = false)}>Save Configuration</Button>
			</div>
		</div>
	{/if}

	<!-- Premium Upgrade Banner -->
	{#if !premium}
		<div class="premium-banner" transition:slide={{ duration: 300 }}>
			<div class="premium-content">
				<Icon name="crown" size={20} />
				<div class="premium-text">
					<strong>Unlock Advanced AI Reasoning</strong>
					<p>Get step-by-step legal analysis with transparent thinking process</p>
				</div>
				<Button size="sm" onclick={() => onupgrade?.()}>Upgrade Now</Button>
			</div>
		</div>
	{/if}
</div>

<style>
	.thinking-style-control {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.toggle-container {
		position: relative;
		display: flex;
		align-items: center;
	}
	.thinking-toggle-btn {
		min-width: 140px;
		justify-content: flex-start;
	}
	.icon-container {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		margin-right: 0.5rem;
	}
	.toggle-text {
		font-size: 0.875rem;
	}
	.loading-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid transparent;
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}
	.tooltip {
		position: absolute;
		top: calc(100% + 0.5rem);
		left: 0;
		z-index: 50;
		pointer-events: none;
	}
	.tooltip-content {
		background: var(--color-panel-soft, #1c1917);
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		padding: 0.75rem;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
		max-width: 320px;
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}
	.tooltip-content strong {
		display: block;
		margin-bottom: 0.25rem;
	}
	.tooltip-content p {
		margin-bottom: 0.5rem;
		opacity: 0.9;
		font-size: 0.8125rem;
		line-height: 1.4;
	}
	.feature-list {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
	.feature {
		font-size: 0.75rem;
		opacity: 0.8;
	}
	.config-panel {
		background: var(--color-panel-soft, #1c1917);
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.75rem;
		padding: 1.25rem;
	}
	.config-header {
		margin-bottom: 1rem;
	}
	.config-header h4 {
		font-size: 0.9375rem;
		font-weight: 600;
	}
	.config-subtitle {
		font-size: 0.8125rem;
		opacity: 0.6;
		margin-top: 0.25rem;
	}
	.config-content {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.setting-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.setting-label {
		font-size: 0.875rem;
		font-weight: 500;
	}
	.setting-select {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.375rem;
		background: var(--color-panel, #0c0a09);
		color: inherit;
		font-size: 0.875rem;
	}
	.setting-select:focus {
		outline: none;
		border-color: var(--color-accent, #a51c30);
		box-shadow: 0 0 0 2px rgba(165, 28, 48, 0.2);
	}
	.checkbox-group {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		cursor: pointer;
	}
	.config-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}
	.premium-banner {
		background: linear-gradient(135deg, #c9a96e, #8b7355);
		color: #0c0a09;
		border-radius: 0.5rem;
		padding: 1rem;
	}
	.premium-content {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.premium-text {
		flex: 1;
	}
	.premium-text strong {
		display: block;
		margin-bottom: 0.25rem;
		font-weight: 600;
	}
	.premium-text p {
		margin: 0;
		font-size: 0.875rem;
		opacity: 0.9;
	}
</style>
