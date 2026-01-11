<script lang="ts">
	/**
	 * Svelte 5 + bits-ui v2.x Button Template
	 *
	 * Native runes - $props(), $derived(), $bindable()
	 * Styled with UnoCSS NES theme
	 *
	 * @example
	 * <Svelte5Button variant="primary" onclick={handleClick}>
	 *   Save Changes
	 * </Svelte5Button>
	 *
	 * <Svelte5Button variant="danger" loading={isSaving}>
	 *   {#snippet icon()}
	 *     <Trash class="w-4 h-4" />
	 *   {/snippet}
	 *   Delete
	 * </Svelte5Button>
	 */
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import type { Snippet } from 'svelte';

	type ButtonVariant = 'default' | 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'link';
	type ButtonSize = 'sm' | 'md' | 'lg';

	interface Props {
		variant?: ButtonVariant;
		size?: ButtonSize;
		disabled?: boolean;
		loading?: boolean;
		type?: 'button' | 'submit' | 'reset';
		children?: Snippet;
		icon?: Snippet;
		class?: string;
		onclick?: (e: MouseEvent) => void;
	}

	let {
		variant = 'default',
		size = 'md',
		disabled = false,
		loading = false,
		type = 'button',
		children,
		icon,
		class: className = '',
		onclick
	}: Props = $props();

	// Derived variant classes
	const variantClasses = $derived({
		default: 'border-nes-border bg-nes-panel text-nes-text hover:bg-nes-bg',
		primary: 'border-nes-accent bg-nes-accent/20 text-nes-accent hover:bg-nes-accent/30',
		secondary: 'border-nes-muted bg-nes-muted/20 text-nes-text hover:bg-nes-muted/30',
		danger: 'border-nes-danger bg-nes-danger/20 text-nes-danger hover:bg-nes-danger/30',
		success: 'border-nes-success bg-nes-success/20 text-nes-success hover:bg-nes-success/30',
		ghost: 'border-transparent bg-transparent text-nes-text hover:bg-nes-panel',
		link: 'border-transparent bg-transparent text-nes-accent underline hover:text-nes-accent2'
	}[variant]);

	// Derived size classes
	const sizeClasses = $derived({
		sm: 'px-2 py-1 text-xs',
		md: 'px-4 py-2 text-sm',
		lg: 'px-6 py-3 text-base'
	}[size]);

	// Combined computed state
	const isDisabled = $derived(disabled || loading);
</script>

<button
	{type}
	class="inline-flex items-center justify-center gap-2 border-4 font-mono uppercase tracking-wide
		transition-all duration-150 focus: outline-none, focus:ring-2 focus: ring-nes-accent, focus:ring-offset-2
		disabled: opacity-50, disabled:cursor-not-allowed
		{variantClasses} {sizeClasses} { className }"
	disabled={isDisabled}
	onclick={ onclick }
>
	{#if loading}
		<Loader2 class="w-4 h-4 animate-spin" />
	{:else if icon}
		{@render icon()}
	{/if}

	{#if children}
		{@render children()}
	{/if}
</button>


