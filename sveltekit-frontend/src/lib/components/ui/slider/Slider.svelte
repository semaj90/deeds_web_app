<script lang="ts">
	interface Props {
		/** Current value */
		value?: number;
		/** Callback when value changes */
		onValueChange?: (value: number) => void;
		/** Minimum value */
		min?: number;
		/** Maximum value */
		max?: number;
		/** Step increment */
		step?: number;
		/** Whether the slider is disabled */
		disabled?: boolean;
		/** Orientation */
		orientation?: 'horizontal' | 'vertical';
		/** Name for form submission */
		name?: string;
		/** Additional CSS classes */
		class?: string;
		/** ARIA label */
		'aria-label'?: string;
	}

	let {
		value = $bindable(0),
		onValueChange,
		min = 0,
		max = 100,
		step = 1,
		disabled = false,
		orientation = 'horizontal',
		name,
		class: className = '',
		'aria-label': ariaLabel = 'Slider',
	}: Props = $props();

	let trackRef = $state<HTMLDivElement | null>(null);
	let isDragging = $state(false);

	const percentage = $derived(((value - min) / (max - min)) * 100);

	function updateValue(clientX: number, clientY: number) {
		if (!trackRef || disabled) return;

		const rect = trackRef.getBoundingClientRect();
		let ratio: number;

		if (orientation === 'horizontal') {
			ratio = (clientX - rect.left) / rect.width;
		} else {
			ratio = 1 - (clientY - rect.top) / rect.height;
		}

		ratio = Math.max(0, Math.min(1, ratio));
		const newValue = min + ratio * (max - min);
		const steppedValue = Math.round(newValue / step) * step;

		value = Math.max(min, Math.min(max, steppedValue));
		onValueChange?.(value);
	}

	function handleMouseDown(e: MouseEvent) {
		if (disabled) return;
		isDragging = true;
		updateValue(e.clientX, e.clientY);

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}

	function handleMouseMove(e: MouseEvent) {
		if (isDragging) {
			updateValue(e.clientX, e.clientY);
		}
	}

	function handleMouseUp() {
		isDragging = false;
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (disabled) return;

		let newValue = value;

		switch (e.key) {
			case 'ArrowRight':
			case 'ArrowUp':
				newValue = Math.min(max, value + step);
				break;
			case 'ArrowLeft':
			case 'ArrowDown':
				newValue = Math.max(min, value - step);
				break;
			case 'Home':
				newValue = min;
				break;
			case 'End':
				newValue = max;
				break;
			default:
				return;
		}

		e.preventDefault();
		value = newValue;
		onValueChange?.(value);
	}

	const trackClass = `
		relative flex w-full touch-none select-none items-center
	`.replace(/\s+/g, ' ').trim();

	const rangeClass = `
		relative h-2 w-full grow overflow-hidden rounded-full bg-secondary
	`.replace(/\s+/g, ' ').trim();
</script>

<div
	class="{trackClass} {className}"
	data-orientation={orientation}
	data-disabled={disabled || undefined}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={trackRef}
		class={rangeClass}
		onmousedown={ handleMouseDown }
	>
		<!-- Filled track -->
		<div
			class="absolute h-full bg-primary"
			style="width: {percentage}%"
		></div>
	</div>

	<!-- Thumb -->
	<button
		type="button"
		role="slider"
		aria-valuemin={ min }
		aria-valuemax={max}
		aria-valuenow={ value }
		aria-label={ ariaLabel }
		aria-orientation={orientation}
		{disabled}
		onkeydown={ handleKeydown }
		class="absolute block h-5 w-5 rounded-full border-2 border-primary bg-background
			ring-offset-background transition-colors focus-visible:outline-none
			focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
			disabled:pointer-events-none disabled:opacity-50"
		style="left: calc({percentage}% - 10px)"
	></button>
</div>

{#if name}
	<input type="hidden" { name } { value } />
{/if}
