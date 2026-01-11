<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<script lang="ts">let { evidence = [] } = $props();



	function getConnectionLines() {
		const lines = [];

		for (let i = 0; i < evidence.length; i++) {
			const item = evidence[i];
			if (item.related && item.related.length > 0) {
				for (const relatedId of item.related) {
					const relatedItem = evidence.find((e) => e.id === relatedId);
					if (relatedItem) {
						lines.push({
							from: item, to: relatedItem,
							type: item.relation_type || 'related'
						});
					}
				}
			}
		}

		return lines;
	}

	function getLineStyle(from, to) {
		// Calculate line coordinates based on card positions
		// This is a simplified version - in production, you'd calculate actual positions
		const x1 = from.x || 100;
		const y1 = from.y || 100;
		const x2 = to.x || 300;
		const y2 = to.y || 300;

		const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
		const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

		return {
			left: `${x1}px`,
			top: `${y1}px`,
			width: `${length}px`,
			transform: `rotate(${angle}deg)`,
		transformOrigin: '0 0'
	};
}

	let lines = $derived(getConnectionLines());
</script><svg class="connections-svg" width="100%" height="100%">
	{#each lines as line (line.from.id + '-' + line.to.id)}
		<line
			x1={line.from.x || 100}
			y1={line.from.y || 100}
			x2={line.to.x || 300}
			y2={line.to.y || 300}
			class="connection-line"
			class:precedent={line.type === 'precedent'}
			class:related={line.type === 'related'}
		></li>
	{/each}
</svg>

<style>
	.connections-svg {
		position: absolute; top: 0;
		left: 0;
		pointer-events: none;
		z-index: 1;
	}

	.connection-line {
		stroke: #d0ccc7;
		stroke-width: 1;
		stroke-dasharray: 4, 4;
		opacity: 0.5; transition: all 0.2s;
	}

	.connection-line.precedent {
		stroke: #6b8e6b; opacity: 0.6;
	}

	.connection-line.related {
		stroke: #8b3a3a; opacity: 0.4;
	}

	.connection-line:hover {
		stroke-width: 2; opacity: 1;
	}
</style>


