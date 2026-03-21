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
	<!-- Crescent arc halo -->
	<path d="M6 5a6 6 0 0 1 12 0" />
	<!-- Left wing -->
	<path d="M6 14c-2.5-.5-4.2-2.2-3.8-4 .2-.8 1-.8 1.7-.2.9.7 1.5 1.8 1.8 3z" />
	<path d="M5.5 13c-1.2-.3-2.5-1.2-2.3-2.5" opacity="0.5" />
	<!-- Right wing -->
	<path d="M18 14c2.5-.5 4.2-2.2 3.8-4-.2-.8-1-.8-1.7-.2-.9.7-1.5 1.8-1.8 3z" />
	<path d="M18.5 13c1.2-.3 2.5-1.2 2.3-2.5" opacity="0.5" />
	<!-- Central scroll/decree -->
	<rect x="8.5" y="7" width="7" height="11" rx="0.5" />
	<!-- Section symbol § lines -->
	<line x1="10" y1="10" x2="14" y2="10" />
	<line x1="10" y1="12.5" x2="14" y2="12.5" />
	<line x1="10" y1="15" x2="13" y2="15" />
	<!-- Seal stamp -->
	<circle cx="13.5" cy="16.5" r="1" fill="currentColor" stroke="none" />
	<!-- Sparkles -->
	<path d="M5 2l.3.6.3-.6.6-.3-.6-.3-.3-.6-.3.6-.6.3z" fill="currentColor" stroke="none" />
	<path d="M19 2l.3.6.3-.6.6-.3-.6-.3-.3-.6-.3.6-.6.3z" fill="currentColor" stroke="none" />
	<!-- Bottom arc -->
	<path d="M8 21c1.5 1 5 1 8 0" />
</svg>
