#!/usr/bin/env node
/**
 * Codebase Graph Topology Analysis
 * Fetches the AST graph and identifies:
 * - High complexity hotspots
 * - Orphan nodes (no edges)
 * - Large files
 * - High coupling (many imports)
 * - Directory consolidation candidates
 * - Cluster health
 */

const BASE = process.env.BASE_URL || 'http://localhost:5173';

async function fetchGraph(maxFiles = 500) {
	const url = `${BASE}/api/codebase-index/graph?maxFiles=${maxFiles}`;
	console.log(`Fetching graph from ${url}...`);
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Graph fetch failed: ${res.status} ${res.statusText}`);
	}
	return res.json();
}

function analyzeGraph(data) {
	const { nodes = [], edges = [], clusters = [] } = data;
	console.log(`\n=== CODEBASE GRAPH ANALYSIS ===`);
	console.log(`Total nodes: ${nodes.length}`);
	console.log(`Total edges: ${edges.length}`);
	console.log(`Total clusters: ${clusters.length}`);

	// Build adjacency maps
	const connIds = new Set();
	const inDegree = {};
	const outDegree = {};
	for (const edge of edges) {
		connIds.add(edge.source);
		connIds.add(edge.target);
		outDegree[edge.source] = (outDegree[edge.source] || 0) + 1;
		inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
	}

	// 1. Orphan nodes (no edges at all)
	const orphans = nodes.filter((n) => !connIds.has(n.id));
	console.log(`\n--- ORPHAN NODES (${orphans.length}) ---`);
	orphans.slice(0, 30).forEach((n) => {
		console.log(`  ${n.filePath || n.id} [${n.type || 'unknown'}] complexity=${n.complexity || 0}`);
	});
	if (orphans.length > 30) console.log(`  ... and ${orphans.length - 30} more`);

	// 2. High complexity hotspots (> 10)
	const highComplexity = nodes
		.filter((n) => (n.complexity || 0) > 10)
		.sort((a, b) => (b.complexity || 0) - (a.complexity || 0));
	console.log(`\n--- HIGH COMPLEXITY (${highComplexity.length} nodes, complexity > 10) ---`);
	highComplexity.slice(0, 20).forEach((n) => {
		console.log(`  ${n.filePath || n.id} complexity=${n.complexity} lines=${n.lineCount || '?'}`);
	});

	// 3. Large files (> 200 lines)
	const largeFiles = nodes
		.filter((n) => (n.lineCount || 0) > 200)
		.sort((a, b) => (b.lineCount || 0) - (a.lineCount || 0));
	console.log(`\n--- LARGE FILES (${largeFiles.length} nodes, > 200 lines) ---`);
	largeFiles.slice(0, 20).forEach((n) => {
		console.log(`  ${n.filePath || n.id} lines=${n.lineCount} complexity=${n.complexity || 0}`);
	});

	// 4. High coupling (> 8 outgoing imports)
	const highCoupling = nodes
		.filter((n) => (outDegree[n.id] || 0) > 8)
		.sort((a, b) => (outDegree[b.id] || 0) - (outDegree[a.id] || 0));
	console.log(`\n--- HIGH COUPLING (${highCoupling.length} nodes, > 8 outgoing imports) ---`);
	highCoupling.slice(0, 20).forEach((n) => {
		console.log(
			`  ${n.filePath || n.id} out=${outDegree[n.id]} in=${inDegree[n.id] || 0} complexity=${n.complexity || 0}`,
		);
	});

	// 5. High fan-in (most imported, > 5 importers)
	const highFanIn = nodes
		.filter((n) => (inDegree[n.id] || 0) > 5)
		.sort((a, b) => (inDegree[b.id] || 0) - (inDegree[a.id] || 0));
	console.log(`\n--- HIGH FAN-IN (${highFanIn.length} nodes, > 5 importers) ---`);
	highFanIn.slice(0, 20).forEach((n) => {
		console.log(
			`  ${n.filePath || n.id} importers=${inDegree[n.id]} out=${outDegree[n.id] || 0}`,
		);
	});

	// 6. Directory aggregation
	const dirStats = {};
	for (const n of nodes) {
		const path = n.filePath || n.id || '';
		const parts = path.split('/');
		// Get top 3 levels of directory
		const dir = parts.slice(0, Math.min(parts.length - 1, 4)).join('/');
		if (!dir) continue;
		if (!dirStats[dir]) {
			dirStats[dir] = {
				files: 0,
				totalComplexity: 0,
				totalLines: 0,
				orphans: 0,
				maxComplexity: 0,
			};
		}
		dirStats[dir].files++;
		dirStats[dir].totalComplexity += n.complexity || 0;
		dirStats[dir].totalLines += n.lineCount || 0;
		dirStats[dir].maxComplexity = Math.max(dirStats[dir].maxComplexity, n.complexity || 0);
		if (!connIds.has(n.id)) dirStats[dir].orphans++;
	}

	// Sort dirs by total complexity
	const sortedDirs = Object.entries(dirStats)
		.sort((a, b) => b[1].totalComplexity - a[1].totalComplexity);
	console.log(`\n--- DIRECTORY HOTSPOTS (by total complexity) ---`);
	sortedDirs.slice(0, 25).forEach(([dir, stats]) => {
		const orphanPct = stats.files > 0 ? Math.round((stats.orphans / stats.files) * 100) : 0;
		console.log(
			`  ${dir}: ${stats.files} files, complexity=${stats.totalComplexity}, lines=${stats.totalLines}, orphans=${stats.orphans}(${orphanPct}%), maxC=${stats.maxComplexity}`,
		);
	});

	// 7. Consolidation candidates: dirs with high orphan % AND low complexity
	const consolidationCandidates = Object.entries(dirStats)
		.filter(([_, s]) => s.files >= 3 && s.orphans / s.files > 0.5)
		.sort((a, b) => b[1].orphans - a[1].orphans);
	console.log(`\n--- DIRECTORY CONSOLIDATION CANDIDATES (>50% orphans, 3+ files) ---`);
	consolidationCandidates.slice(0, 15).forEach(([dir, stats]) => {
		const orphanPct = Math.round((stats.orphans / stats.files) * 100);
		console.log(
			`  ${dir}: ${stats.files} files, ${stats.orphans} orphans (${orphanPct}%), avgComplexity=${Math.round(stats.totalComplexity / stats.files)}`,
		);
	});

	// 8. Cluster analysis
	if (clusters.length > 0) {
		console.log(`\n--- CLUSTER HEALTH ---`);
		for (const cluster of clusters) {
			const clusterNodes = nodes.filter((n) => n.cluster === cluster.id || n.clusterId === cluster.id);
			const clusterOrphans = clusterNodes.filter((n) => !connIds.has(n.id));
			console.log(
				`  Cluster "${cluster.name || cluster.id}": ${clusterNodes.length} nodes, ${clusterOrphans.length} orphans`,
			);
		}
	}

	// 9. Summary stats
	const avgComplexity = nodes.length > 0
		? (nodes.reduce((s, n) => s + (n.complexity || 0), 0) / nodes.length).toFixed(1)
		: 0;
	const avgLines = nodes.length > 0
		? Math.round(nodes.reduce((s, n) => s + (n.lineCount || 0), 0) / nodes.length)
		: 0;
	const totalLines = nodes.reduce((s, n) => s + (n.lineCount || 0), 0);

	console.log(`\n=== SUMMARY ===`);
	console.log(`Total files analyzed: ${nodes.length}`);
	console.log(`Total lines of code: ${totalLines}`);
	console.log(`Average complexity: ${avgComplexity}`);
	console.log(`Average file size: ${avgLines} lines`);
	console.log(`Orphan files: ${orphans.length} (${nodes.length > 0 ? Math.round((orphans.length / nodes.length) * 100) : 0}%)`);
	console.log(`High complexity files: ${highComplexity.length}`);
	console.log(`High coupling files: ${highCoupling.length}`);
	console.log(`Large files: ${largeFiles.length}`);
	console.log(`Directories with >50% orphans: ${consolidationCandidates.length}`);

	return {
		orphans,
		highComplexity,
		largeFiles,
		highCoupling,
		highFanIn,
		consolidationCandidates,
		dirStats,
		summary: {
			totalNodes: nodes.length,
			totalEdges: edges.length,
			totalLines,
			avgComplexity: parseFloat(avgComplexity),
			avgLines,
			orphanCount: orphans.length,
			orphanPct: nodes.length > 0 ? Math.round((orphans.length / nodes.length) * 100) : 0,
		},
	};
}

async function main() {
	try {
		const maxFiles = parseInt(process.argv[2] || '500', 10);
		const data = await fetchGraph(maxFiles);
		const results = analyzeGraph(data);

		// Write JSON results for further processing
		const { writeFileSync } = await import('fs');
		writeFileSync(
			'scripts/graph-analysis-results.json',
			JSON.stringify(results.summary, null, 2),
		);
		console.log(`\nResults summary written to scripts/graph-analysis-results.json`);
	} catch (err) {
		console.error('Analysis failed:', err.message);
		process.exit(1);
	}
}

main();
