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
	<ellipse cx="12" cy="1.5" rx="2.5" ry="0.7" />
	<!-- Left wing -->
	<path d="M5 10c-2.5-.5-4-2.2-3.7-3.8.2-.8 1-.8 1.7-.2.8.6 1.4 1.6 1.7 2.8z" />
	<path d="M4.5 9c-1.2-.3-2.2-1-2-2.2" opacity="0.5" />
	<!-- Right wing -->
	<path d="M19 10c2.5-.5 4-2.2 3.7-3.8-.2-.8-1-.8-1.7-.2-.8.6-1.4 1.6-1.7 2.8z" />
	<path d="M19.5 9c1.2-.3 2.2-1 2-2.2" opacity="0.5" />
	<!-- Central shield -->
	<path d="M12 4L5.5 7.5v4c0 4.5 3 7.5 6.5 9 3.5-1.5 6.5-4.5 6.5-9v-4L12 4z" />
	<!-- Checkmark -->
	<polyline points="9 12 11 14.5 15.5 9.5" />
	<!-- Divider band -->
	<line x1="7.5" y1="7.5" x2="16.5" y2="7.5" opacity="0.25" />
	<!-- Sparkles -->
	<path d="M3 3l.3.6.3-.6.6-.3-.6-.3-.3-.6-.3.6-.6.3z" fill="currentColor" stroke="none" />
	<path d="M21 3l.3.6.3-.6.6-.3-.6-.3-.3-.6-.3.6-.6.3z" fill="currentColor" stroke="none" />
	<path d="M12 23l.2.4.2-.4.4-.2-.4-.2-.2-.4-.2.4-.4.2z" fill="currentColor" stroke="none" />
</svg>
