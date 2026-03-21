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
	<ellipse cx="12" cy="2" rx="2.5" ry="0.8" />
	<!-- Left wing (compact) -->
	<path d="M6 11c-2-.4-3.5-1.8-3.2-3.2.2-.7.8-.7 1.5-.2.8.6 1.3 1.5 1.5 2.5z" />
	<path d="M5.5 10c-1-.3-2-1-1.8-2" opacity="0.5" />
	<!-- Right wing (compact) -->
	<path d="M18 11c2-.4 3.5-1.8 3.2-3.2-.2-.7-.8-.7-1.5-.2-.8.6-1.3 1.5-1.5 2.5z" />
	<path d="M18.5 10c1-.3 2-1 1.8-2" opacity="0.5" />
	<!-- Central folder -->
	<path d="M5 9V7.5a1 1 0 0 1 1-1h4l1.5 1.5H18a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9z" />
	<!-- Evidence tag inside -->
	<rect x="9" y="11" width="6" height="5" rx="0.3" />
	<line x1="10.5" y1="13" x2="13.5" y2="13" />
	<line x1="10.5" y1="14.5" x2="12.5" y2="14.5" />
	<!-- Seal dot -->
	<circle cx="16" cy="9.5" r="0.7" fill="currentColor" stroke="none" />
	<!-- Sparkles -->
	<path d="M3 4l.3.6.3-.6.6-.3-.6-.3-.3-.6-.3.6-.6.3z" fill="currentColor" stroke="none" />
	<path d="M21 4l.3.6.3-.6.6-.3-.6-.3-.3-.6-.3.6-.6.3z" fill="currentColor" stroke="none" />
	<!-- Bottom arc -->
	<path d="M9 21c1 .8 4 .8 6 0" />
</svg>
