<script lang="ts">
	/**
	 * Base Icon Component - Svelte 5 Runes Mode
	 * Zero dependencies, pure SVG wrapper
	 */
	interface Props {
		size?: number | string;
		strokeWidth?: number;
		color?: string;
		class?: string;
	}

	let {
		size = 24,
		strokeWidth = 2,
		color = 'currentColor',
		class: className = ''
	}: Props = $props();

	const sizeValue = $derived(typeof size === 'number' ? `${size}px` : size);
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={sizeValue}
	height={sizeValue}
	viewBox="0 0 24 24"
	fill="none"
	stroke={color}
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	role="img"
	aria-hidden="true"
>
	<slot />
</svg>
