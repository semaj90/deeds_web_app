<script lang="ts">
	let { class: className = '', size = 24, strokeWidth = 1.5 }: { class?: string; size?: number; strokeWidth?: number } = $props();
</script>

<!-- YORHA Interface: sidebar-collapsed → expand panel -->
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
	<!-- Narrow left panel divider (collapsed state) -->
	<line x1="7" y1="4" x2="7" y2="20" />
	<!-- Collapsed left panel micro-lines -->
	<line x1="4.75" y1="9" x2="5.75" y2="9" opacity="0.55" />
	<line x1="4.75" y1="12" x2="5.75" y2="12" opacity="0.55" />
	<line x1="4.75" y1="15" x2="5.75" y2="15" opacity="0.55" />
	<!-- Expand arrow (→) in right area -->
	<polyline points="11 9.5 14 12 11 14.5" />
	<!-- Tick mark accent at divider top -->
	<line x1="7" y1="4" x2="7" y2="6" stroke-width={strokeWidth * 2} opacity="0.5" />
</svg>
