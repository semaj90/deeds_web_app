<script lang="ts">

/**
 * Svelte 5 Badge Component
 * Small status indicator with Svelte 5 runes
 */
import type { Snippet } from 'svelte';

interface Props {
	variant?: 'default' | 'secondary' | 'success' | 'warning' | 'error' | 'outline';
	size?: 'sm' | 'md' | 'lg';
	pill?: boolean;
	dot?: boolean;
	removable?: boolean;
	class?: string;
	onremove?: () => void;
	children?: Snippet;
}

let {
	variant = 'default',
	size = 'md',
	pill = false,
	dot = false,
	removable = false,
	class: className = '',
	onremove,
	children
}: Props = $props();

let variantClasses = $derived({
	default: 'bg-info text-white',
	secondary: 'bg-panelSoft text-white',
	success: 'bg-accent text-white',
	warning: 'bg-warning text-black',
	error: 'bg-danger text-white',
	outline: 'bg-transparent border border-sand/30 text-sand/40'
}[variant]);

let sizeClasses = $derived({
	sm: 'px-1.5 py-0.5 text-xs',
	md: 'px-2 py-0.5 text-xs',
	lg: 'px-2.5 py-1 text-sm'
}[size]);

let shapeClasses = $derived(pill ? 'rounded-full' : 'rounded');
</script>

<span
	class="inline-flex items-center gap-1 font-medium {variantClasses} {sizeClasses} {shapeClasses} {className}"
>
	{#if dot}
		<span class="w-1.5 h-1.5 rounded-full bg-current opacity-75"></span>
	{/if}

	{#if children}
		{@render children()}
	{/if}

	{#if removable}
		<button
			type="button"
			class="ml-0.5 -mr-0.5 p-0.5 rounded-full hover:bg-black/20 transition-colors"
			aria-label="Remove"
			onclick={ onremove }
		>
			<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	{/if}
</span>


