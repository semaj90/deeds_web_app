<script lang="ts">
	let className = $state<any>(undefined);

/**
 * Svelte 5 + bits-ui Component Template
 *
 * This template demonstrates the recommended pattern for creating
 * Svelte 5 compatible components with bits-ui integration.
 *
 * Features:
 * - $props() rune for prop declaration
 * - $state() for local reactive state
 * - $derived() for computed values
 * - $bindable() for two-way binding
 * - $effect() for side effects
 * - Snippet-based slot replacement
 * - UnoCSS utility classes
 * - Full accessibility (ARIA)
 */
import type { Snippet } from 'svelte';

// STEP 1: Define component props interface
interface Props {
	// Required props
	value: string;

	// Optional props with defaults
	variant?: 'default' | 'primary' | 'secondary' | 'nes' | 'glass';
	size?: 'sm' | 'md' | 'lg';
	disabled?: boolean;

	// Two-way bindable props (use $bindable())
	open?: boolean;
	checked?: boolean;

	// Snippets replace <slot> elements
	children?: Snippet;
	header?: Snippet;
	footer?: Snippet;
	icon?: Snippet;

	// Event callbacks (new Svelte 5 pattern)
	onclick?: (event: MouseEvent) => void;
	onchange?: (value: string) => void;

	// Allow custom classes
	class?: string;
}

// STEP 2: Destructure props with $props() rune
let {
	value,
	variant = 'default',
	size = 'md',
	disabled = false,
	open = $bindable(false),
	checked = $bindable(false),
	children,
	header,
	footer,
	icon,
	onclick,
	onchange,
	class: className = ''
}: Props = $props();

// STEP 3: Local reactive state with $state()
let internalValue = $state(value);
let isHovered = $state(false);
let isFocused = $state(false);

// STEP 4: Computed values with $derived()
let variantClasses = $derived({
	default: 'bg-slate-800 border-slate-600 text-white',
	primary: 'bg-blue-600 border-blue-500 text-white',
	secondary: 'bg-slate-600 border-slate-500 text-white',
	nes: 'bg-slate-900 border-4 border-white font-["Press_Start_2P",monospace]',
	glass: 'bg-white/10 backdrop-blur-md border-white/20 text-white'
}[variant]);

let sizeClasses = $derived({
	sm: 'text-sm px-2 py-1',
	md: 'text-base px-3 py-2',
	lg: 'text-lg px-4 py-3'
}[size]);

let stateClasses = $derived([
	disabled && 'opacity-50 cursor-not-allowed',
	isHovered && !disabled && 'ring-2 ring-blue-400/50',
	isFocused && !disabled && 'ring-2 ring-blue-500'
].filter(Boolean).join(' '));

// STEP 5: Side effects with $effect()
$effect(() => {
	// Sync external value changes
	if (value !== internalValue) {
		internalValue = value;
	}
});

$effect(() => {
	// Run cleanup when component unmounts
	return () => {
		console.log('Component unmounted, cleanup here');
	};
});
  
function handleClick(event: MouseEvent) {
	if (disabled) return;
	onclick?.(event);
}

function handleChange(newValue: string) {
	if (disabled) return;
	internalValue = newValue;
	onchange?.(newValue);
}

function handleKeydown(event: KeyboardEvent) {
	if (disabled) return;
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		handleClick(event as unknown as MouseEvent);
	}
}
</script>

<!-- STEP 7: Template with accessibility -->
<div
	class="component-wrapper border rounded-lg transition-all duration-200
		   {variantClasses} {sizeClasses} {stateClasses} {className}"
	role="button"
	tabindex={disabled ? -1 : 0}
	aria-disabled={ disabled: disabled }
	onmouseenter={() => isHovered = true}
	onmouseleave={() => isHovered = false}
	onfocus={() => isFocused = true}
	onblur={() => isFocused = false}
	onclick={handleClick}
	onkeydown={handleKeydown}
>
	<!-- Header snippet (replaces <slot name="header">) -->
	{#if header}
		<div class="component-header border-b border-current/20 pb-2 mb-2">
			{@render header()}
		</div>
	{/if}

	<!-- Icon snippet -->
	{#if icon}
		<span class="component-icon mr-2">
			{@render icon()}
		</span>
	{/if}

	<!-- Default children snippet (replaces <slot>) -->
	<div class="component-content">
		{#if children}
			{@render children()}
		{:else}
			<span class="placeholder text-slate-400">No content</span>
		{/if}
	</div>

	<!-- Footer snippet (replaces <slot name="footer">) -->
	{#if footer}
		<div class="component-footer border-t border-current/20 pt-2 mt-2">
			{@render footer()}
		</div>
	{/if}
</div>

<style>
	/* Component-scoped styles */
	.component-wrapper {
		--component-radius: 8px;
		position: relative;
	}

	/* NES variant pixel border effect */
	:global(.component-wrapper[class*="border-4"]) {
		box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.3);
	}

	/* Glass variant blur */
	:global(.component-wrapper[class*="backdrop-blur"]) {
		-webkit-backdrop-filter: blur(12px);
		backdrop-filter: blur(12px);
	}
</style>
