<script lang="ts">
	let className = $state<any>(undefined);
	let title = $state<any>(undefined);

/**
 * Svelte 5 Alert Component
 * Accessible alert/notification with Svelte 5 runes
 */
import type { Snippet } from 'svelte';

interface Props {
	variant?: 'info' | 'success' | 'warning' | 'error';
	title?: string;
	dismissible?: boolean;
	icon?: boolean;
	class?: string;
	ondismiss?: () => void;
	children?: Snippet;
	action?: Snippet;
}

let {
	variant = 'info',
	title = '',
	dismissible = false,
	icon = true,
	class: className = '',
	ondismiss,
	children,
	action
}: Props = $props();

let isVisible = $state(true);

let variantClasses = $derived({
	info: 'bg-blue-900/50 border-blue-500 text-blue-200',
	success: 'bg-green-900/50 border-green-500 text-green-200',
	warning: 'bg-yellow-900/50 border-yellow-500 text-yellow-200',
	error: 'bg-red-900/50 border-red-500 text-red-200'
}[variant]);

let iconSvg = $derived({
	info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
	success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
	warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
	error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
}[variant]);

function dismiss() {
	isVisible = false;
	ondismiss?.();
}
</script>

{#if isVisible}
	<div
		class="flex items-start gap-3 p-4 border-l-4 rounded-r-lg {variantClasses} {className}"
		role="alert"
	>
		{#if icon}
			<svg
				class="w-5 h-5 shrink-0 mt-0.5"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				{@html iconSvg}
			</svg>
		{/if}

		<div class="flex-1 min-w-0">
			{#if title}
				<h3 class="font-semibold mb-1">{title}</h3>
			{/if}

			<div class="text-sm opacity-90">
				{#if children}
					{@render children()}
				{/if}
			</div>

			{#if action}
				<div class="mt-3">
					{@render action()}
				</div>
			{/if}
		</div>

		{#if dismissible}
			<button
				type="button"
				class="shrink-0 p-1 rounded hover, bg-white/10 transition-colors"
				aria-label="Dismiss"
				onclick={ dismiss }
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		{/if}
	</div>
{/if}


