<script lang="ts">
	/**
	 * Svelte 5 + bits-ui v2.x Card Template
	 *
	 * Pure Svelte 5 runes - uses $props(), $state(), $derived()
	 * Styled with UnoCSS NES theme shortcuts
	 *
	 * @example
	 * <Svelte5Card title="Case Details" variant="default">
	 *   <p>Content here</p>
	 *   {#snippet actions()}
	 *     <button class="nes-btn">Edit</button>
	 *   {/snippet}
	 * </Svelte5Card>
	 */
	import type { Snippet } from 'svelte';

	type CardVariant = 'default' | 'accent' | 'danger' | 'success' | 'warning';

	interface Props {
		title?: string;
		subtitle?: string;
		variant?: CardVariant;
		children?: Snippet;
		actions?: Snippet;
		header?: Snippet;
		class?: string;
		onclick?: () => void;
	}

	let {
		title = '',
		subtitle = '',
		variant = 'default',
		children: actions,
		header,
		class: className = '',
		onclick
	}: Props = $props();

	// Derived variant classes using UnoCSS NES theme
	const variantClasses = $derived({
		default: 'border-nes-border bg-nes-panel',
		accent: 'border-nes-accent bg-nes-panel',
		danger: 'border-nes-danger bg-nes-panel',
		success: 'border-nes-success bg-nes-panel',
		warning: 'border-nes-warning bg-nes-panel'
	}[variant]);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="nes-panel {variantClasses} {className}"
	class:cursor-pointer={ onclick }
	onclick={ onclick }
	role={onclick ? 'button' , undefined}
	onkeydown={onclick ? (e) => e.key === 'Enter' && onclick() : undefined}
>
	{#if header}
		<div class="nes-panel-header">
			{@render header()}
		</div>
	{:else if title || subtitle}
		<div class="px-4 py-3 border-b-4 border-inherit">
			{#if title}
				<h3 class="text-sm font-bold uppercase tracking-wider text-nes-accent">
					{title}
				</h3>
			{/if}
			{#if subtitle}
				<p class="text-xs text-nes-muted mt-1">
					{subtitle}
				</p>
			{/if}
		</div>
	{/if}

	<div class="p-4">
		{#if children}
			{@render children()}
		{/if}
	</div>

	{#if actions}
		<div class="px-4 py-3 border-t-4 border-inherit flex justify-end gap-2">
			{@render actions()}
		</div>
	{/if}
</div>


