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
	<!-- Sunrise arc halo -->
	<path d="M5 6a7 7 0 0 1 14 0" />
	<!-- Ray lines from arc -->
	<line x1="12" y1="1" x2="12" y2="2.5" />
	<line x1="8" y1="2" x2="8.5" y2="3.2" />
	<line x1="16" y1="2" x2="15.5" y2="3.2" />
	<!-- Left wing (compact) -->
	<path d="M6.5 13c-2-.5-3.5-2-3.2-3.8.2-.8 1-.8 1.8-.3.9.7 1.5 1.8 2 3z" />
	<!-- Right wing (compact) -->
	<path d="M17.5 13c2-.5 3.5-2 3.2-3.8-.2-.8-1-.8-1.8-.3-.9.7-1.5 1.8-2 3z" />
	<!-- Central orb -->
	<circle cx="12" cy="10" r="3.5" />
	<!-- "A" letter inside orb (glossary/definition) -->
	<path d="M10.8 13l1.2-4 1.2 4" />
	<line x1="11.2" y1="11.8" x2="12.8" y2="11.8" />
	<!-- Bottom decorative lines -->
	<line x1="9" y1="16" x2="15" y2="16" />
	<line x1="10" y1="18" x2="14" y2="18" />
	<!-- Sparkle -->
	<path d="M19 8l.3.6.3-.6.6-.3-.6-.3-.3-.6-.3.6-.6.3z" fill="currentColor" stroke="none" />
</svg>
