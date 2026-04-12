<script lang="ts">
	let { class: className = '', size = 24, strokeWidth = 1.5 }: { class?: string; size?: number; strokeWidth?: number } = $props();
</script>

<!-- YORHA Interface: sidebar-expanded → collapse panel -->
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
	<!-- Outer viewport frame with YORHA corner notches -->
	<path d="M4 4h16v16H4V4z" />
	<!-- Corner data nodes -->
	<circle cx="4" cy="4" r="0.6" fill="currentColor" stroke="none" />
	<circle cx="20" cy="4" r="0.6" fill="currentColor" stroke="none" />
	<circle cx="4" cy="20" r="0.6" fill="currentColor" stroke="none" />
	<circle cx="20" cy="20" r="0.6" fill="currentColor" stroke="none" />
	<!-- Left panel divider -->
	<line x1="10" y1="4" x2="10" y2="20" />
	<!-- Left panel scan-lines (panel content indicator) -->
	<line x1="5.5" y1="8" x2="8.5" y2="8" opacity="0.55" />
	<line x1="5.5" y1="11" x2="8.5" y2="11" opacity="0.55" />
	<line x1="5.5" y1="14" x2="8.5" y2="14" opacity="0.55" />
	<!-- Collapse arrow (←) in right area -->
	<polyline points="16 9.5 13 12 16 14.5" />
	<!-- Tick mark accent at divider top -->
	<line x1="10" y1="4" x2="10" y2="6" stroke-width={strokeWidth * 2} opacity="0.5" />
</svg>
