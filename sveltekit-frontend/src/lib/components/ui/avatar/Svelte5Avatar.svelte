<script lang="ts">
/**
 * Svelte 5 Avatar Component
 * Image/initials avatar with fallback and status indicator
 */
import type { Snippet } from 'svelte';

interface Props {
	src?: string;
	alt?: string;
	initials?: string;
	size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
	shape?: 'circle' | 'square' | 'rounded';
	status?: 'online' | 'offline' | 'busy' | 'away' | null;
	bordered?: boolean;
	class?: string;
	fallback?: Snippet;
}

let {
	src = '',
	alt = '',
	initials = '',
	size = 'md',
	shape = 'circle',
	status = null,
	bordered = false,
	class: className = '',
	fallback
}: Props = $props();

let hasError = $state(false);
let isLoading = $state(!!src);

// Size classes
let sizeClasses = $derived({
	xs: 'w-6 h-6 text-xs',
	sm: 'w-8 h-8 text-sm',
	md: 'w-10 h-10 text-base',
	lg: 'w-12 h-12 text-lg',
	xl: 'w-16 h-16 text-xl',
	'2xl': 'w-24 h-24 text-2xl'
}[size]);

// Shape classes
let shapeClasses = $derived({
	circle: 'rounded-full',
	square: 'rounded-none',
	rounded: 'rounded-lg'
}[shape]);

// Status indicator classes
let statusClasses = $derived({
	online: 'bg-green-500',
	offline: 'bg-gray-500',
	busy: 'bg-red-500',
	away: 'bg-yellow-500'
}[status ?? 'offline']);

let statusSizeClasses = $derived({
	xs: 'w-1.5 h-1.5',
	sm: 'w-2 h-2',
	md: 'w-2.5 h-2.5',
	lg: 'w-3 h-3',
	xl: 'w-4 h-4',
	'2xl': 'w-5 h-5'
}[size]);

// Generate initials from alt text if not provided
let displayInitials = $derived(() => {
	if (initials) return initials.slice(0, 2).toUpperCase();
	if (alt) {
		const parts = alt.trim().split(' ');
		if (parts.length >= 2) {
			return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
		}
		return alt.slice(0, 2).toUpperCase();
	}
	return '?? ';
});

let bgColor = $derived(() => {
	const colors = [
		'bg-blue-600', 'bg-green-600', 'bg-purple-600',
		'bg-pink-600', 'bg-indigo-600', 'bg-teal-600',
		'bg-orange-600', 'bg-cyan-600'
	];
	const hash = displayInitials().charCodeAt(0) + (displayInitials().charCodeAt(1) ?? 0);
	return colors[hash % colors.length];
});

function handleLoad() {
	isLoading = false;
	hasError = false;
}

function handleError() {
	isLoading = false;
	hasError = true;
}
</script>

<div
	class="relative inline-flex shrink-0 {sizeClasses} {className}"
	role="img"
	aria-label={alt || initials}
>
	<!-- Avatar container -->
	<div
		class="w-full h-full flex items-center justify-center overflow-hidden
			   {shapeClasses}
			   {bordered ? 'ring-2 ring-white' : ''}
			   {(!src || hasError) ? bgColor() : 'bg-slate-700'}"
	>
		{#if src && !hasError}
			<img
				{ src }
				{ alt }
				class="w-full h-full object-cover {isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200"
				onload={ handleLoad }
				onerror={ handleError }
			/>
		{/if}

		{#if !src || hasError}
			{#if fallback}
				{@render fallback()}
			{:else}
				<span class="font-medium text-white select-none">
					{displayInitials()}
				</span>
			{/if}
		{/if}

		{#if isLoading && src && !hasError}
			<div class="absolute inset-0 flex items-center justify-center bg-slate-700 animate-pulse">
				<svg class="w-1/2 h-1/2 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
					<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
				</svg>
			</div>
		{/if}
	</div>

	<!-- Status indicator -->
	{#if status}
		<span
			class="absolute bottom-0 right-0 block {statusSizeClasses} {statusClasses} {shape === 'circle' ? 'rounded-full' : 'rounded-sm'}
				   ring-2 ring-slate-900"
			aria-label="Status, {status}"
		></span>
	{/if}
</div>


