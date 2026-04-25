#!/usr/bin/env node
/**
 * Error Graph Visualizer - Phase 72+
 *
 * Creates an interactive HTML visualization of:
 * - All files in the project
 * - Their dependencies (imports/exports)
 * - Errors and warnings
 * - Missing dependencies
 * - Clickable links to open files in VS Code
 *
 * Uses D3.js for graph visualization with:
 * - Force-directed layout
 * - Color-coded by error severity
 * - Filtering by file type and error count
 * - Search functionality
 */

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const kbFile = args.includes('--kb') ? args[args.indexOf('--kb') + 1] : 'reports/latest/enhanced-ast-kb.tree.json';
const problemsFile = args.includes('--problems') ? args[args.indexOf('--problems') + 1] : 'reports/latest/vscode-problems.json';
const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : 'reports/latest/error-graph.html';

console.log(chalk.cyan.bold('📊 Error Graph Visualizer\n'));

/**
 * Load data files
 */
function loadData() {
	const kbPath = path.join(__dirname, '..', kbFile);
	const problemsPath = path.join(__dirname, '..', problemsFile);

	if (!fs.existsSync(kbPath)) {
		console.error(chalk.red(`❌ Knowledge base not found: ${kbPath}`));
		console.log(chalk.yellow('Run: node scripts/enhanced-ast-analyzer.mjs'));
		process.exit(1);
	}

	const kb = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
	let problems = { byFile: {}, stats: { totalProblems: 0 } };

	if (fs.existsSync(problemsPath)) {
		problems = JSON.parse(fs.readFileSync(problemsPath, 'utf-8'));
	} else {
		console.log(chalk.yellow('⚠️  No problems file found, generating visualization without errors'));
	}

	return { kb, problems };
}

/**
 * Merge KB and problems data
 */
function mergeData(kb, problems) {
	// Add error info to each node
	kb.graph.nodes.forEach(node => {
		const fileProblems = problems.byFile[node.path] || problems.byFile[node.label] || [];
		node.problems = fileProblems;
		node.errorCount = fileProblems.filter(p => p.severity === 'error').length;
		node.warningCount = fileProblems.filter(p => p.severity === 'warning').length;
	});

	// Resolve import edges
	const nodesByPath = new Map();
	kb.graph.nodes.forEach(node => {
		nodesByPath.set(node.path, node);
		nodesByPath.set(node.label, node);
	});

	const resolvedEdges = [];
	kb.graph.edges.forEach(edge => {
		const sourceNode = kb.graph.nodes.find(n => n.id === edge.source);
		if (!sourceNode) return;

		// Try to resolve target
		let targetNode = null;
		const importPath = edge.target;

		// Try various resolution strategies
		const candidates = [
			importPath,
			importPath + '.ts',
			importPath + '.js',
			importPath + '.svelte',
			importPath + '/index.ts',
			importPath + '/index.js',
			path.join(path.dirname(sourceNode.path), importPath),
			path.join(path.dirname(sourceNode.path), importPath + '.ts'),
			path.join(path.dirname(sourceNode.path), importPath + '.js')
		];

		for (const candidate of candidates) {
			targetNode = nodesByPath.get(candidate);
			if (targetNode) break;
		}

		if (targetNode) {
			resolvedEdges.push({
				source: edge.source,
				target: targetNode.id,
				type: edge.type,
				label: edge.label,
				resolved: true
			});
		} else {
			// Keep unresolved as potential missing dependency
			resolvedEdges.push({
				source: edge.source,
				target: importPath,
				type: 'missing',
				label: 'missing import',
				resolved: false
			});
		}
	});

	kb.graph.edges = resolvedEdges;

	return kb;
}

/**
 * Generate HTML visualization
 */
function generateHTML(kb) {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Project Error Graph - Phase 72+</title>
	<script src="https://d3js.org/d3.v7.min.js"></script>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
			background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
			color: #e0e0e0;
			overflow: hidden;
		}

		#container {
			display: flex;
			height: 100vh;
		}

		#sidebar {
			width: 300px;
			background: #252526;
			border-right: 1px solid #3e3e42;
			padding: 20px;
			overflow-y: auto;
		}

		#graph-container {
			flex: 1;
			position: relative;
		}

		h1 {
			font-size: 1.5rem;
			margin-bottom: 20px;
			color: #4ec9b0;
		}

		.stats {
			background: #1e1e1e;
			padding: 15px;
			border-radius: 8px;
			margin-bottom: 20px;
		}

		.stat-item {
			display: flex;
			justify-content: space-between;
			margin: 8px 0;
			font-size: 0.9rem;
		}

		.stat-label {
			color: #858585;
		}

		.stat-value {
			color: #4ec9b0;
			font-weight: bold;
		}

		.controls {
			margin-top: 20px;
		}

		.control-group {
			margin-bottom: 15px;
		}

		label {
			display: block;
			margin-bottom: 5px;
			font-size: 0.85rem;
			color: #858585;
		}

		input[type="text"], select {
			width: 100%;
			padding: 8px;
			background: #3c3c3c;
			border: 1px solid #555;
			border-radius: 4px;
			color: #e0e0e0;
			font-size: 0.9rem;
		}

		input[type="range"] {
			width: 100%;
		}

		.legend {
			margin-top: 20px;
			padding: 15px;
			background: #1e1e1e;
			border-radius: 8px;
		}

		.legend-item {
			display: flex;
			align-items: center;
			margin: 8px 0;
			font-size: 0.85rem;
		}

		.legend-color {
			width: 16px;
			height: 16px;
			border-radius: 50%;
			margin-right: 8px;
		}

		svg {
			width: 100%;
			height: 100%;
		}

		.node {
			cursor: pointer;
			stroke: #fff;
			stroke-width: 1.5px;
		}

		.node:hover {
			stroke: #ffd700;
			stroke-width: 3px;
		}

		.link {
			stroke: #555;
			stroke-opacity: 0.6;
			stroke-width: 1px;
		}

		.link.missing {
			stroke: #ff6b6b;
			stroke-dasharray: 5,5;
		}

		.node-label {
			font-size: 10px;
			fill: #e0e0e0;
			pointer-events: none;
			user-select: none;
		}

		.tooltip {
			position: absolute;
			padding: 10px;
			background: rgba(30, 30, 30, 0.95);
			border: 1px solid #555;
			border-radius: 4px;
			pointer-events: none;
			font-size: 0.85rem;
			max-width: 300px;
			z-index: 1000;
		}

		.tooltip-title {
			font-weight: bold;
			color: #4ec9b0;
			margin-bottom: 5px;
		}

		.tooltip-section {
			margin: 5px 0;
		}

		.error-badge {
			display: inline-block;
			padding: 2px 6px;
			border-radius: 3px;
			font-size: 0.75rem;
			margin: 2px;
		}

		.error-badge.error {
			background: #f44336;
			color: white;
		}

		.error-badge.warning {
			background: #ff9800;
			color: white;
		}

		#file-list {
			margin-top: 20px;
			max-height: 300px;
			overflow-y: auto;
		}

		.file-item {
			padding: 8px;
			margin: 4px 0;
			background: #3c3c3c;
			border-radius: 4px;
			cursor: pointer;
			font-size: 0.85rem;
		}

		.file-item:hover {
			background: #4c4c4c;
		}

		.file-item.has-errors {
			border-left: 3px solid #f44336;
		}

		.file-item.has-warnings {
			border-left: 3px solid #ff9800;
		}
	</style>
</head>
<body>
	<div id="container">
		<div id="sidebar">
			<h1>🧠 Error Graph</h1>

			<div class="stats">
				<div class="stat-item">
					<span class="stat-label">Total Files:</span>
					<span class="stat-value" id="stat-files">${kb.stats.totalFiles}</span>
				</div>
				<div class="stat-item">
					<span class="stat-label">Total Errors:</span>
					<span class="stat-value error-badge error" id="stat-errors">${kb.stats.totalErrors}</span>
				</div>
				<div class="stat-item">
					<span class="stat-label">Dependencies:</span>
					<span class="stat-value" id="stat-imports">${kb.stats.totalImports}</span>
				</div>
				<div class="stat-item">
					<span class="stat-label">Missing Imports:</span>
					<span class="stat-value" id="stat-missing">0</span>
				</div>
			</div>

			<div class="controls">
				<div class="control-group">
					<label>Search Files:</label>
					<input type="text" id="search" placeholder="Type to filter...">
				</div>

				<div class="control-group">
					<label>File Type:</label>
					<select id="file-type">
						<option value="all">All Types</option>
						<option value="svelte">Svelte (.svelte)</option>
						<option value="typescript">TypeScript (.ts)</option>
						<option value="javascript">JavaScript (.js)</option>
						<option value="go">Go (.go)</option>
						<option value="python">Python (.py)</option>
						<option value="cpp">C++/CUDA (.cpp, .cu)</option>
					</select>
				</div>

				<div class="control-group">
					<label>Show Only:</label>
					<select id="error-filter">
						<option value="all">All Files</option>
						<option value="errors">Files with Errors</option>
						<option value="warnings">Files with Warnings</option>
						<option value="clean">Clean Files</option>
					</select>
				</div>

				<div class="control-group">
					<label>Link Distance: <span id="link-distance-value">100</span></label>
					<input type="range" id="link-distance" min="30" max="300" value="100">
				</div>

				<div class="control-group">
					<label>Charge Strength: <span id="charge-value">-300</span></label>
					<input type="range" id="charge-strength" min="-1000" max="-50" value="-300">
				</div>
			</div>

			<div class="legend">
				<div class="legend-item">
					<div class="legend-color" style="background: #4ec9b0;"></div>
					<span>Clean (no errors)</span>
				</div>
				<div class="legend-item">
					<div class="legend-color" style="background: #ff9800;"></div>
					<span>Has Warnings</span>
				</div>
				<div class="legend-item">
					<div class="legend-color" style="background: #f44336;"></div>
					<span>Has Errors</span>
				</div>
				<div class="legend-item">
					<div class="legend-color" style="background: #9c27b0;"></div>
					<span>Many Errors (5+)</span>
				</div>
			</div>

			<div id="file-list"></div>
		</div>

		<div id="graph-container">
			<svg id="graph"></svg>
			<div class="tooltip" id="tooltip" style="display: none;"></div>
		</div>
	</div>

	<script>
		// Data
		const graphData = ${JSON.stringify(kb.graph)};
		const clusters = ${JSON.stringify(kb.clusters)};

		// Setup SVG
		const container = d3.select('#graph-container');
		const svg = d3.select('#graph');
		const width = container.node().clientWidth;
		const height = container.node().clientHeight;

		svg.attr('width', width).attr('height', height);

		const g = svg.append('g');

		// Zoom behavior
		const zoom = d3.zoom()
			.scaleExtent([0.1, 10])
			.on('zoom', (event) => {
				g.attr('transform', event.transform);
			});

		svg.call(zoom);

		// Tooltip
		const tooltip = d3.select('#tooltip');

		// Color scale
		function getNodeColor(node) {
			if (node.errorCount >= 5) return '#9c27b0';
			if (node.errorCount > 0) return '#f44336';
			if (node.warningCount > 0) return '#ff9800';
			return '#4ec9b0';
		}

		function getNodeSize(node) {
			const base = 5;
			const errorBonus = node.errorCount * 2;
			return base + errorBonus;
		}

		// Force simulation
		let linkDistance = 100;
		let chargeStrength = -300;

		const simulation = d3.forceSimulation(graphData.nodes)
			.force('link', d3.forceLink(graphData.edges)
				.id(d => d.id)
				.distance(linkDistance))
			.force('charge', d3.forceManyBody().strength(chargeStrength))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius(d => getNodeSize(d) + 5));

		// Links
		const link = g.append('g')
			.selectAll('line')
			.data(graphData.edges)
			.join('line')
			.attr('class', d => \`link \${d.resolved ? '' : 'missing'}\`);

		// Nodes
		const node = g.append('g')
			.selectAll('circle')
			.data(graphData.nodes)
			.join('circle')
			.attr('class', 'node')
			.attr('r', getNodeSize)
			.attr('fill', getNodeColor)
			.call(drag(simulation))
			.on('click', (event, d) => {
				// Open file in VS Code
				const vscodeUrl = \`vscode://file/\${d.path}\`;
				window.open(vscodeUrl, '_blank');
			})
			.on('mouseover', (event, d) => {
				const problems = d.problems || [];
				const errorProblems = problems.filter(p => p.severity === 'error');
				const warningProblems = problems.filter(p => p.severity === 'warning');

				let html = \`<div class="tooltip-title">\${d.label}</div>\`;
				html += \`<div class="tooltip-section">Type: \${d.fileType}</div>\`;
				html += \`<div class="tooltip-section">Imports: \${d.metadata.importCount}</div>\`;
				html += \`<div class="tooltip-section">Exports: \${d.metadata.exportCount}</div>\`;

				if (errorProblems.length > 0) {
					html += \`<div class="tooltip-section"><span class="error-badge error">\${errorProblems.length} errors</span></div>\`;
					html += \`<div class="tooltip-section">\${errorProblems.slice(0, 3).map(p => \`• \${p.message}\`).join('<br>')}</div>\`;
				}

				if (warningProblems.length > 0) {
					html += \`<div class="tooltip-section"><span class="error-badge warning">\${warningProblems.length} warnings</span></div>\`;
				}

				html += \`<div class="tooltip-section" style="margin-top: 10px; font-style: italic;">Click to open in VS Code</div>\`;

				tooltip
					.style('display', 'block')
					.style('left', (event.pageX + 10) + 'px')
					.style('top', (event.pageY + 10) + 'px')
					.html(html);
			})
			.on('mouseout', () => {
				tooltip.style('display', 'none');
			});

		// Labels (only show for nodes with errors)
		const label = g.append('g')
			.selectAll('text')
			.data(graphData.nodes.filter(n => n.errorCount > 0))
			.join('text')
			.attr('class', 'node-label')
			.text(d => d.label.split('/').pop());

		// Update positions
		simulation.on('tick', () => {
			link
				.attr('x1', d => {
					const source = graphData.nodes.find(n => n.id === d.source.id || n.id === d.source);
					return source ? source.x : 0;
				})
				.attr('y1', d => {
					const source = graphData.nodes.find(n => n.id === d.source.id || n.id === d.source);
					return source ? source.y : 0;
				})
				.attr('x2', d => {
					if (typeof d.target === 'object') return d.target.x;
					return 0;
				})
				.attr('y2', d => {
					if (typeof d.target === 'object') return d.target.y;
					return 0;
				});

			node
				.attr('cx', d => d.x)
				.attr('cy', d => d.y);

			label
				.attr('x', d => d.x + 10)
				.attr('y', d => d.y + 3);
		});

		// Drag behavior
		function drag(simulation) {
			function dragstarted(event, d) {
				if (!event.active) simulation.alphaTarget(0.3).restart();
				d.fx = d.x;
				d.fy = d.y;
			}

			function dragged(event, d) {
				d.fx = event.x;
				d.fy = event.y;
			}

			function dragended(event, d) {
				if (!event.active) simulation.alphaTarget(0);
				d.fx = null;
				d.fy = null;
			}

			return d3.drag()
				.on('start', dragstarted)
				.on('drag', dragged)
				.on('end', dragended);
		}

		// Controls
		d3.select('#link-distance').on('input', function() {
			linkDistance = +this.value;
			d3.select('#link-distance-value').text(linkDistance);
			simulation.force('link').distance(linkDistance);
			simulation.alpha(0.3).restart();
		});

		d3.select('#charge-strength').on('input', function() {
			chargeStrength = +this.value;
			d3.select('#charge-value').text(chargeStrength);
			simulation.force('charge').strength(chargeStrength);
			simulation.alpha(0.3).restart();
		});

		// Filter controls
		function filterNodes() {
			const search = d3.select('#search').property('value').toLowerCase();
			const fileType = d3.select('#file-type').property('value');
			const errorFilter = d3.select('#error-filter').property('value');

			node.style('opacity', d => {
				let visible = true;

				if (search && !d.label.toLowerCase().includes(search)) {
					visible = false;
				}

				if (fileType !== 'all' && d.fileType !== fileType) {
					visible = false;
				}

				if (errorFilter === 'errors' && d.errorCount === 0) {
					visible = false;
				} else if (errorFilter === 'warnings' && d.warningCount === 0 && d.errorCount === 0) {
					visible = false;
				} else if (errorFilter === 'clean' && (d.errorCount > 0 || d.warningCount > 0)) {
					visible = false;
				}

				return visible ? 1 : 0.1;
			});

			link.style('opacity', d => {
				const sourceVisible = node.filter(n => n.id === (d.source.id || d.source)).style('opacity') == 1;
				const targetVisible = typeof d.target === 'object' && node.filter(n => n.id === d.target.id).style('opacity') == 1;
				return (sourceVisible && targetVisible) ? 0.6 : 0.05;
			});
		}

		d3.select('#search').on('input', filterNodes);
		d3.select('#file-type').on('change', filterNodes);
		d3.select('#error-filter').on('change', filterNodes);

		// Populate file list
		const fileList = d3.select('#file-list');
		const sortedFiles = [...graphData.nodes].sort((a, b) => b.errorCount - a.errorCount);

		sortedFiles.slice(0, 50).forEach(file => {
			const item = fileList.append('div')
				.attr('class', \`file-item \${file.errorCount > 0 ? 'has-errors' : file.warningCount > 0 ? 'has-warnings' : ''}\`)
				.text(file.label.split('/').pop())
				.on('click', () => {
					window.open(\`vscode://file/\${file.path}\`, '_blank');
				});
		});

		// Update missing imports stat
		const missingCount = graphData.edges.filter(e => !e.resolved).length;
		d3.select('#stat-missing').text(missingCount);
	</script>
</body>
</html>`;

	return html;
}

/**
 * Main function
 */
function visualize() {
	const { kb, problems } = loadData();
	const mergedKb = mergeData(kb, problems);
	const html = generateHTML(mergedKb);

	const outputPath = path.join(__dirname, '..', outputFile);
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, html);

	console.log(chalk.green.bold('✅ Graph visualization generated!\n'));
	console.log(chalk.cyan(`📊 Open in browser: file:///${outputPath}\n`));
	console.log(chalk.gray('Features:'));
	console.log(chalk.gray('  • Interactive force-directed graph'));
	console.log(chalk.gray('  • Click nodes to open files in VS Code'));
	console.log(chalk.gray('  • Filter by file type and errors'));
	console.log(chalk.gray('  • Search for specific files'));
	console.log(chalk.gray('  • Visual error indicators\n'));
}

visualize();
