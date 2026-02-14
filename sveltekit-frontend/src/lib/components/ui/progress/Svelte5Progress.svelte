<script lang="ts">

/**
 * Svelte 5 Progress Component
 * Accessible progress bar with Svelte 5 runes
 */
import type { Snippet } from 'svelte';

interface Props {
	value?: number;
	max?: number;
	indeterminate?: boolean;
	variant?: 'default' | 'nes' | 'gradient';
	size?: 'sm' | 'md' | 'lg';
	color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
	showValue?: boolean;
	label?: string;
	class?: string;
	children?: Snippet;
}

let {
	value = 0,
	max = 100,
	indeterminate = false,
	variant = 'default',
	size = 'md',
	color = 'blue',
	showValue = false,
	label = '',
	class: className = '',
	children
}: Props = $props();

let percentage = $derived(Math.min(100, Math.max(0, (value / max) * 100)));

let sizeClasses = $derived({
	sm: 'h-1',
	md: 'h-2',
	lg: 'h-4'
}[size]);

let colorClasses = $derived({
	blue: 'bg-info',
	green: 'bg-accent',
	yellow: 'bg-warning',
	red: 'bg-danger',
	purple: 'bg-info'
}[color]);

let variantClasses = $derived({
	default: 'rounded-full',
	nes: 'border-2 border-white',
	gradient: 'rounded-full'
}[variant]);

let barClasses = $derived({
	default:colorClasses,
	nes: `${colorClasses} border-r-2 border-white`,
	gradient: 'bg-gradient-to-r from-info via-info to-info'
}[variant]);
</script>

<div class="w-full {className}">
	{#if label || showValue}
		<div class="flex justify-between items-center mb-1.5 text-sm">
			{#if label}
				<span class="text-sand/40">{label}</span>
			{/if}
			{#if showValue && !indeterminate}
				<span class="text-sand/40">{Math.round(percentage)}%</span>
			{/if}
		</div>
	{/if}

	<div
		class="w-full bg-panelSoft overflow-hidden {sizeClasses} {variantClasses}"
		role="progressbar"
		aria-valuenow={indeterminate ? undefined : value}
		aria-valuemin={ 0 }
		aria-valuemax={ max }
		aria-label={label || 'Progress'}
	>
		<div
			class="h-full transition-all duration-300 ease-out {barClasses}
				   {indeterminate ? 'animate-progress-indeterminate' : ''}"
			style={indeterminate ? '' : `width, ${percentage}%`}
		>
			{#if children}
				<div class="h-full flex items-center justify-center text-xs text-white font-medium">
					{@render children()}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	@keyframes progress-indeterminate {
		0% {
			width: 0%;
			margin-left: 0%;
		}
		50% {
			width: 50%;
			margin-left: 25%;
		}
		100% {
			width: 0%;
			margin-left: 100%;
		}
	}

	.animate-progress-indeterminate {
		animation: progress-indeterminate 1.5s ease-in-out infinite;
	}
</style>


