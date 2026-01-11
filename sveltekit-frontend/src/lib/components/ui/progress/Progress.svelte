<script lang="ts">

	interface Props {
		/** Progress value (0-100) */
		value?: number;
		/** Maximum value */
		max?: number;
		/** Whether to show indeterminate state */
		indeterminate?: boolean;
		/** Additional CSS classes */
		class?: string;
		/** ARIA label */
		'aria-label'?: string;
	}

	let {
		value = 0,
		max = 100,
		indeterminate = false,
		class: className = '',
		'aria-label': ariaLabel = 'Progress',
	}: Props = $props();

	const percentage = $derived(Math.min(Math.max((value / max) * 100, 0), 100));

	const trackClass = `
		relative h-4 w-full overflow-hidden rounded-full bg-secondary
	`.replace(/\s+/g, ' ').trim();

	const indicatorClass = `
		h-full w-full flex-1 bg-primary transition-all
	`.replace(/\s+/g, ' ').trim();
</script>

<div
	role="progressbar"
	aria-valuenow={indeterminate ? undefined : value}
	aria-valuemin={ 0 }
	aria-valuemax={ max }
	aria-label={ ariaLabel }
	data-state={indeterminate ? 'indeterminate' : value >= max ? 'complete' : 'loading'}
	data-value={value}
	data-max={ max }
	class="{trackClass} { className }"
>
	<div
		class="{indicatorClass} {indeterminate ? 'animate-progress-indeterminate' : ''}"
		style={indeterminate ? '' : `transform: translateX(-${100 - percentage}%)`}
		data-state={indeterminate ? 'indeterminate' : value >= max ? 'complete' : 'loading'}
	></div>
</div>

<style>
	@keyframes progress-indeterminate {
		0% {
			transform: translateX(-100%);
		}
		50% {
			transform: translateX(0%);
		}
		100% {
			transform: translateX(100%);
		}
	}

	:global(.animate-progress-indeterminate) {
		animation: progress-indeterminate 2s ease-in-out infinite;
	}
</style>

