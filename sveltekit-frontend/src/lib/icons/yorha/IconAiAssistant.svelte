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
	<!-- Halo (prominent, NieR-style) -->
	<ellipse cx="12" cy="2" rx="3.5" ry="1" />
	<!-- Left wing (full spread) -->
	<path d="M5.5 12c-3-.7-5.2-3-4.8-5 .3-1.2 1.5-1.2 2.5-.4 1.2.9 2 2.5 2.3 4z" />
	<path d="M4.8 11c-2-.5-3.5-2-3.2-3.5" opacity="0.5" />
	<path d="M4 10c-1-.3-2-1-1.8-2" opacity="0.3" />
	<!-- Right wing (full spread) -->
	<path d="M18.5 12c3-.7 5.2-3 4.8-5-.3-1.2-1.5-1.2-2.5-.4-1.2.9-2 2.5-2.3 4z" />
	<path d="M19.2 11c2-.5 3.5-2 3.2-3.5" opacity="0.5" />
	<path d="M20 10c1-.3 2-1 1.8-2" opacity="0.3" />
	<!-- Central head/visor -->
	<rect x="7" y="5.5" width="10" height="6" rx="1.5" />
	<!-- Visor band -->
	<line x1="7" y1="8.5" x2="17" y2="8.5" />
	<!-- Eyes (lens) -->
	<circle cx="10" cy="7" r="0.8" />
	<circle cx="14" cy="7" r="0.8" />
	<!-- Jaw/chin -->
	<path d="M9 11.5v1.5a3 3 0 0 0 6 0v-1.5" />
	<!-- Neural pulse line -->
	<path d="M7 18l1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5" />
	<!-- Neck -->
	<line x1="12" y1="14.5" x2="12" y2="16.5" />
	<!-- Sparkles -->
	<path d="M3 3l.4.8.4-.8.8-.4-.8-.4-.4-.8-.4.8-.8.4z" fill="currentColor" stroke="none" />
	<path d="M21 3l.4.8.4-.8.8-.4-.8-.4-.4-.8-.4.8-.8.4z" fill="currentColor" stroke="none" />
	<!-- Bottom arc -->
	<path d="M8 20.5c1.5 1 5 1 8 0" />
</svg>
