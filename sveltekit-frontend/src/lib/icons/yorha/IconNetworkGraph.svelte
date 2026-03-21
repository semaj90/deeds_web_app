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
	<!-- Halo arc -->
	<path d="M6 3.5a6 6 0 0 1 12 0" />
	<!-- Left wing (small) -->
	<path d="M4 10c-1.5-.3-2.8-1.3-2.5-2.5.1-.6.7-.6 1.2-.2.6.5 1 1.2 1.2 2z" />
	<!-- Right wing (small) -->
	<path d="M20 10c1.5-.3 2.8-1.3 2.5-2.5-.1-.6-.7-.6-1.2-.2-.6.5-1 1.2-1.2 2z" />
	<!-- Constellation edges -->
	<line x1="12" y1="6" x2="6" y2="12" />
	<line x1="12" y1="6" x2="18" y2="12" />
	<line x1="6" y1="12" x2="12" y2="18" />
	<line x1="18" y1="12" x2="12" y2="18" />
	<line x1="6" y1="12" x2="18" y2="12" />
	<!-- Nodes as celestial orbs -->
	<circle cx="12" cy="6" r="1.8" />
	<circle cx="6" cy="12" r="1.8" />
	<circle cx="18" cy="12" r="1.8" />
	<circle cx="12" cy="18" r="1.8" />
	<!-- Central dot fills -->
	<circle cx="12" cy="6" r="0.6" fill="currentColor" stroke="none" />
	<circle cx="6" cy="12" r="0.6" fill="currentColor" stroke="none" />
	<circle cx="18" cy="12" r="0.6" fill="currentColor" stroke="none" />
	<circle cx="12" cy="18" r="0.6" fill="currentColor" stroke="none" />
	<!-- Sparkles -->
	<path d="M3 5l.3.5.3-.5.5-.3-.5-.3-.3-.5-.3.5-.5.3z" fill="currentColor" stroke="none" />
	<path d="M21 5l.3.5.3-.5.5-.3-.5-.3-.3-.5-.3.5-.5.3z" fill="currentColor" stroke="none" />
	<!-- Bottom arc -->
	<path d="M8 21c1.5 1 5 1 8 0" />
</svg>
