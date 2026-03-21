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
	<ellipse cx="12" cy="2.5" rx="2.5" ry="0.8" />
	<!-- Left wing -->
	<path d="M7 11c-2.5-.5-4.5-2.5-4.2-4.3.2-.9 1-.9 1.8-.3 1 .8 1.8 2 2.2 3.3z" />
	<path d="M6.2 10c-1.5-.4-2.8-1.5-2.6-2.8" opacity="0.5" />
	<!-- Right wing -->
	<path d="M17 11c2.5-.5 4.5-2.5 4.2-4.3-.2-.9-1-.9-1.8-.3-1 .8-1.8 2-2.2 3.3z" />
	<path d="M17.8 10c1.5-.4 2.8-1.5 2.6-2.8" opacity="0.5" />
	<!-- Central gavel (precedent symbol) -->
	<rect x="9" y="7.5" width="6" height="2.5" rx="0.5" transform="rotate(-20 12 8.75)" />
	<line x1="12" y1="11" x2="13.5" y2="15" />
	<!-- Sound block -->
	<rect x="10" y="15.5" width="7" height="2" rx="0.3" />
	<!-- Chain link (precedent) -->
	<circle cx="7" cy="18" r="1.2" />
	<line x1="7" y1="16.8" x2="7" y2="15.5" />
	<!-- Sparkles -->
	<path d="M4 3.5l.3.6.3-.6.6-.3-.6-.3-.3-.6-.3.6-.6.3z" fill="currentColor" stroke="none" />
	<path d="M20 3.5l.3.6.3-.6.6-.3-.6-.3-.3-.6-.3.6-.6.3z" fill="currentColor" stroke="none" />
	<!-- Bottom arc -->
	<path d="M9 20c1.2 1 3.8 1 6 0" />
</svg>
