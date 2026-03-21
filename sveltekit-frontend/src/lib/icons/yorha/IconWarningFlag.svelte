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
	<!-- Halo over flag -->
	<ellipse cx="11" cy="2" rx="2" ry="0.7" />
	<!-- Left wing (small, behind pole) -->
	<path d="M3 9c-1.2-.3-2-1-1.8-2 .1-.5.5-.5.9-.1.4.4.7.9.8 1.5z" />
	<!-- Right wing -->
	<path d="M19 8c2-.4 3.5-1.8 3.2-3.2-.2-.7-.8-.7-1.5-.2-.7.6-1.2 1.5-1.4 2.5z" />
	<path d="M18.5 7c1-.3 2-1 1.8-2" opacity="0.5" />
	<!-- Flag pole -->
	<line x1="5" y1="4" x2="5" y2="21" />
	<!-- Flag body (angular/tactical) -->
	<path d="M5 4h12l-3 4L17 12H5z" />
	<!-- Exclamation mark -->
	<line x1="10" y1="6.5" x2="10" y2="8.5" />
	<circle cx="10" cy="10" r="0.5" fill="currentColor" stroke="none" />
	<!-- Ground line -->
	<line x1="3" y1="21" x2="7" y2="21" />
	<!-- Sparkles -->
	<path d="M20 3l.3.6.3-.6.6-.3-.6-.3-.3-.6-.3.6-.6.3z" fill="currentColor" stroke="none" />
	<path d="M2 4l.2.4.2-.4.4-.2-.4-.2-.2-.4-.2.4-.4.2z" fill="currentColor" stroke="none" />
	<!-- Bottom sparkle -->
	<path d="M17 18l.3.5.3-.5.5-.3-.5-.3-.3-.5-.3.5-.5.3z" fill="currentColor" stroke="none" />
</svg>
