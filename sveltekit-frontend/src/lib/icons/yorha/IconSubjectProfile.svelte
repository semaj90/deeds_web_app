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
	<ellipse cx="12" cy="3" rx="3" ry="1" />
	<!-- Left wing -->
	<path d="M6.5 14c-3-.8-5-3-4.5-5 .3-1 1.2-1 2.2-.3 1.1.8 2 2.3 2.3 3.8z" />
	<path d="M5.8 13c-2-.5-3.2-1.8-3-3.2" opacity="0.5" />
	<!-- Right wing -->
	<path d="M17.5 14c3-.8 5-3 4.5-5-.3-1-1.2-1-2.2-.3-1.1.8-2 2.3-2.3 3.8z" />
	<path d="M18.2 13c2-.5 3.2-1.8 3-3.2" opacity="0.5" />
	<!-- Central profile head -->
	<circle cx="12" cy="10" r="2.5" />
	<!-- Profile shoulders -->
	<path d="M8.5 17.5c0-2 1.6-3.5 3.5-3.5s3.5 1.5 3.5 3.5" />
	<!-- Orb glow ring -->
	<circle cx="12" cy="12" r="6" opacity="0.15" />
	<!-- Sparkles -->
	<path d="M4 5l.4.8.4-.8.8-.4-.8-.4-.4-.8-.4.8-.8.4z" fill="currentColor" stroke="none" />
	<path d="M20 5l.4.8.4-.8.8-.4-.8-.4-.4-.8-.4.8-.8.4z" fill="currentColor" stroke="none" />
	<!-- Bottom arc -->
	<path d="M8 20c1.5 1.2 5 1.2 8 0" />
</svg>
