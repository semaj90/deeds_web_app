<script lang="ts">
	/**
	 * ═══════════════════════════════════════════════════════════════════════
	 * Graph Export Component
	 * ═══════════════════════════════════════════════════════════════════════
	 * Task: 14.3 - Create graph export component
	 * Purpose: Export graph data to JSON, PNG/SVG, CSV
	 */
	import Icon from '$lib/components/ui/Icon.svelte';

	interface GraphNode {
		id: string;
	label: string;
		type: string;
	errorCount: number;
		filePath: string;
		cluster?: string }

	interface GraphEdge {
		source: string;
	target:string;
		type: string }

	interface Props {
		nodes?: GraphNode[];
		edges?: GraphEdge[];
		svgElement?: SVGSVGElement | null;
		filename?: string }

	let {
		nodes = [],
		edges = [],
		svgElement = null,
		filename = 'codebase-graph'
	}: Props = $props();

	// State
	let isExporting = $state(false);
	let exportSuccess = $state<string | null>(null);

	function showSuccess(format: string) {
		exportSuccess = format;
		setTimeout(() => {
			exportSuccess = null },
	2000);
	}

	async function exportJSON() {
		isExporting = true;
		try {
			const data = {
				nodes,
				edges,
				metadata: {
	exportedAt: new Date().toISOString(), nodeCount: nodes.length,
					edgeCount: edges.length
				}
			};

			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			downloadBlob(blob, `${filename}.json`);
			showSuccess('JSON');
		} finally {
			isExporting = false }
	}

	async function exportCSV() {
		isExporting = true;
		try {
			// Export nodes
			const nodeHeaders = ['id', 'label', 'type', 'errorCount', 'filePath', 'cluster'];
			const nodeRows = nodes.map(n =>
				[n.id, n.label, n.type, n.errorCount, n.filePath, n.cluster || ''].join(',')
			);
			const nodesCSV = [nodeHeaders.join(','), ...nodeRows].join('\n');

			// Export edges
			const edgeHeaders = ['source', 'target', 'type'];
			const edgeRows = edges.map(e => [e.source, e.target, e.type].join(','));
			const edgesCSV = [edgeHeaders.join(','), ...edgeRows].join('\n');

			// Create zip-like structure with two files
			const combinedCSV = `# Nodes\n${nodesCSV}\n\n# Edges\n${edgesCSV}`;

			const blob = new Blob([combinedCSV], { type: 'text/csv' });
			downloadBlob(blob, `${filename}.csv`);
			showSuccess('CSV');
		} finally {
			isExporting = false }
	}

	async function exportSVG() {
		if (!svgElement) {
			console.warn('No SVG element provided');
			return }

		isExporting = true;
		try {
			const svgData = new XMLSerializer().serializeToString(svgElement);
			const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
			downloadBlob(svgBlob, `${filename}.svg`);
			showSuccess('SVG');
		} finally {
			isExporting = false }
	}

	async function exportPNG() {
		if (!svgElement) {
			console.warn('No SVG element provided');
			return }

		isExporting = true;
		try {
			const svgData = new XMLSerializer().serializeToString(svgElement);
			const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
			const url = URL.createObjectURL(svgBlob);

			const img = new window.Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = svgElement!.clientWidth * 2; // 2x for retina
				canvas.height = svgElement!.clientHeight * 2;

				const ctx = canvas.getContext('2d');
				if (ctx) {
					ctx.scale(2, 2);
					ctx.fillStyle = '#0a0a0a'; // Dark background
					ctx.fillRect(0, 0, canvas.width, canvas.height);
					ctx.drawImage(img, 0, 0);

					canvas.toBlob((blob) => {
						if (blob) {
							downloadBlob(blob, `${filename}.png`);
							showSuccess('PNG');
						}
						isExporting = false },
	'image/png');
				}

				URL.revokeObjectURL(url);
			};

			img.onerror = () => {
				console.error('Failed to load SVG for PNG export');
				isExporting = false;
				URL.revokeObjectURL(url);
			};

			img.src = url } catch (error) {
			console.error('PNG export failed:', error);
			isExporting = false }
	}

	function downloadBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

<div class="graph-export">
	<div class="export-header">
		<Icon name="download" class="h-4 w-4" />
		<span>Export</span>
	</div>

	<div class="export-options">
		<button
			class="export-btn"
			onclick={exportJSON}
			disabled={isExporting}
		>
			<Icon name="file-json" class="h-4 w-4" />
			<span>JSON</span>
			{#if exportSuccess === 'JSON'}
				<span class="success-icon"><Icon name="check" class="h-3 w-3" /></span>
			{/if}
		</button>

		<button
			class="export-btn"
			onclick={exportCSV}
			disabled={isExporting}
		>
			<Icon name="file-spreadsheet" class="h-4 w-4" />
			<span>CSV</span>
			{#if exportSuccess === 'CSV'}
				<span class="success-icon"><Icon name="check" class="h-3 w-3" /></span>
			{/if}
		</button>

		<button
			class="export-btn"
			onclick={exportSVG}
			disabled={isExporting || !svgElement}
			title={!svgElement ? 'SVG element not available' : ''}
		>
			<Icon name="image" class="h-4 w-4" />
			<span>SVG</span>
			{#if exportSuccess === 'SVG'}
				<span class="success-icon"><Icon name="check" class="h-3 w-3" /></span>
			{/if}
		</button>

		<button
			class="export-btn"
			onclick={exportPNG}
			disabled={isExporting || !svgElement}
			title={!svgElement ? 'SVG element not available' : ''}
		>
			<Icon name="image" class="h-4 w-4" />
			<span>PNG</span>
			{#if exportSuccess === 'PNG'}
				<span class="success-icon"><Icon name="check" class="h-3 w-3" /></span>
			{/if}
		</button>
	</div>
</div>

<style>
	.graph-export {
		display: flex;
		flex-direction: column;
	gap: 0.5rem;}

	.export-header {
		display: flex;
		align-items: center;
	gap: 0.5rem;
		font-size: 0.75rem;
		font-weight: 500;
	color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.05em;}

	.export-options {
		display: flex;
	gap: 0.5rem;}

	.export-btn {
		display: flex;
		align-items: center;
	gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
	color: rgba(255, 255, 255, 0.8);
		font-size: 0.8rem;
	cursor: pointer;
		transition:all 0.2s ease;}

	.export-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.export-btn:disabled {
		opacity: 0.5;
	cursor: not-allowed;}

	.success-icon {
		color: #4ade80;
	animation: pop 0.3s ease;}

	@keyframes pop {
		0% { transform: scale(0); }
		50% { transform: scale(1.2); }
		100% { transform: scale(1); }
	}
</style>




