<script lang="ts">
	let { class: className = '', size = 24, strokeWidth = 1.5 }: { class?: string; size?: number; strokeWidth?: number } = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
>
	<!-- Halo -->
	<ellipse cx="12" cy="3.5" rx="3" ry="1" />
	<!-- Left wing -->
	<path d="M6 13c-3-1-5-3.5-4.5-5.5.3-1 1.5-1 2.5-.3 1.2.8 2 2.3 2.5 3.8l1 3" />
	<path d="M5.5 12c-2-.5-3.5-2-3.2-3.5" opacity="0.5" />
	<!-- Right wing -->
	<path d="M18 13c3-1 5-3.5 4.5-5.5-.3-1-1.5-1-2.5-.3-1.2.8-2 2.3-2.5 3.8l-1 3" />
	<path d="M18.5 12c2-.5 3.5-2 3.2-3.5" opacity="0.5" />
	<!-- Central book (legal symbol) -->
	<rect x="9" y="9" width="6" height="8" rx="0.5" />
	<line x1="12" y1="9" x2="12" y2="17" />
	<!-- Balance scale on book -->
	<line x1="10.5" y1="12" x2="13.5" y2="12" />
	<path d="M10.5 12l-.5 1.5h2l-.5-1.5" />
	<path d="M13.5 12l-.5 1.5h2l-.5-1.5" />
	<!-- Star sparkles -->
	<path d="M4 4l.5 1 .5-1 1-.5-1-.5-.5-1-.5 1-1 .5z" fill="currentColor" stroke="none" />
	<path d="M20 4l.5 1 .5-1 1-.5-1-.5-.5-1-.5 1-1 .5z" fill="currentColor" stroke="none" />
	<!-- Base arc -->
	<path d="M8 20c1.5 1.5 5.5 1.5 8 0" />
</svg>
