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
	<path d="M7 12c-2.5-.5-4.5-2.5-4.2-4.5.2-1 1.2-1.2 2.2-.5 1.2.9 2 2.5 2.5 4l.5 2" />
	<path d="M6.5 11c-1.5-.3-3-1.5-2.8-3" opacity="0.5" />
	<!-- Right wing -->
	<path d="M17 12c2.5-.5 4.5-2.5 4.2-4.5-.2-1-1.2-1.2-2.2-.5-1.2.9-2 2.5-2.5 4l-.5 2" />
	<path d="M17.5 11c1.5-.3 3-1.5 2.8-3" opacity="0.5" />
	<!-- Central quotation/citation document -->
	<rect x="8.5" y="7" width="7" height="10" rx="0.5" />
	<!-- Quotation marks -->
	<path d="M10 10c0-.7.5-1 1-1s.5.3.5.7-.4.8-1 1.2" />
	<path d="M13 10c0-.7.5-1 1-1s.5.3.5.7-.4.8-1 1.2" />
	<!-- Text lines -->
	<line x1="10" y1="13.5" x2="14" y2="13.5" />
	<line x1="10" y1="15" x2="13" y2="15" />
	<!-- Star sparkles -->
	<path d="M3 5l.4.8.4-.8.8-.4-.8-.4-.4-.8-.4.8-.8.4z" fill="currentColor" stroke="none" />
	<path d="M21 5l.4.8.4-.8.8-.4-.8-.4-.4-.8-.4.8-.8.4z" fill="currentColor" stroke="none" />
	<!-- Bottom arc -->
	<path d="M9 19.5c1 1 4 1 6 0" />
</svg>
