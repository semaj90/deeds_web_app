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
	<!-- Celestial arc over timeline -->
	<path d="M4 4a8 8 0 0 1 16 0" />
	<!-- Star at apex -->
	<path d="M12 1l.4.8.4-.8.8-.4-.8-.4-.4-.8-.4.8-.8.4z" fill="currentColor" stroke="none" />
	<!-- Left wing hint -->
	<path d="M5 8c-1.5-.3-2.5-1.2-2.3-2.2.1-.5.6-.5 1-.1.5.4.8 1 1 1.8z" />
	<!-- Right wing hint -->
	<path d="M19 8c1.5-.3 2.5-1.2 2.3-2.2-.1-.5-.6-.5-1-.1-.5.4-.8 1-1 1.8z" />
	<!-- Vertical timeline spine -->
	<line x1="8" y1="6" x2="8" y2="22" />
	<!-- Event node 1 (star-shaped) -->
	<circle cx="8" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
	<line x1="10" y1="8.5" x2="19" y2="8.5" />
	<line x1="12" y1="7" x2="19" y2="7" opacity="0.4" />
	<!-- Event node 2 -->
	<circle cx="8" cy="14" r="1.2" fill="currentColor" stroke="none" />
	<line x1="10" y1="14" x2="17" y2="14" />
	<line x1="12" y1="12.5" x2="17" y2="12.5" opacity="0.4" />
	<!-- Event node 3 -->
	<circle cx="8" cy="19.5" r="1.2" fill="currentColor" stroke="none" />
	<line x1="10" y1="19.5" x2="18" y2="19.5" />
	<line x1="12" y1="18" x2="16" y2="18" opacity="0.4" />
	<!-- Sparkle -->
	<path d="M20 5l.3.5.3-.5.5-.3-.5-.3-.3-.5-.3.5-.5.3z" fill="currentColor" stroke="none" />
</svg>
