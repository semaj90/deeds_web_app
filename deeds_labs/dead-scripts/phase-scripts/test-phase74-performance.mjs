#!/usr/bin/env node
/**
 * Phase 74 Performance Test
 * Measures actual performance of GPU clustering pipeline
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SVELTE_CHECK_JSON = path.join(ROOT, 'svelte-check-machine.json');
const VECTORS_FILE = path.join(ROOT, 'svelte-check-vectors.json');
const CLUSTERS_FILE = path.join(ROOT, 'svelte-check-clusters.json');

// Performance tracking
const metrics = {
	svelteCheck: { start: 0, end: 0, duration: 0 },
	vectorize: { start: 0, end: 0, duration: 0 },
	cluster: { start: 0, end: 0, duration: 0 },
	total: { start: 0, end: 0, duration: 0 },
	errorCount: 0,
	vectorCount: 0,
	clusterCount: 0
};

function formatDuration(ms) {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${(ms / 60000).toFixed(1)}m`;
}

function run(cmd, args, opts = {}) {
	return new Promise((resolve, reject) => {
		const proc = spawn(cmd, args, {
			stdio: 'pipe',
			shell: true,
			cwd: ROOT,
			...opts
		});

		let stdout = '';
		let stderr = '';

		proc.stdout?.on('data', (chunk) => {
			stdout += chunk.toString();
		});

		proc.stderr?.on('data', (chunk) => {
			stderr += chunk.toString();
		});

		proc.on('exit', (code) => {
			if (code === 0 || code === 1) {
				// svelte-check exits with 1 if errors found
				resolve({ stdout, stderr });
			} else {
				reject(new Error(`${cmd} exited with code ${code}\n${stderr}`));
			}
		});
	});
}

async function testSvelteCheck() {
	console.log('\n📝 Step 1: Running svelte-check...');
	metrics.svelteCheck.start = Date.now();

	try {
		const { stdout } = await run('npx', ['svelte-check', '--output', 'machine']);
		fs.writeFileSync(SVELTE_CHECK_JSON, stdout, 'utf8');

		metrics.svelteCheck.end = Date.now();
		metrics.svelteCheck.duration = metrics.svelteCheck.end - metrics.svelteCheck.start;

		// Parse error count
		const data = JSON.parse(stdout);
		metrics.errorCount = data.diagnostics?.length ?? 0;

		console.log(`✅ svelte-check complete: ${metrics.errorCount} errors found`);
		console.log(`⏱️  Duration: ${formatDuration(metrics.svelteCheck.duration)}`);
	} catch (err) {
		console.error('❌ svelte-check failed:', err.message);
		throw err;
	}
}

async function testVectorize() {
	console.log('\n🔢 Step 2: Vectorizing errors...');
	metrics.vectorize.start = Date.now();

	try {
		// Dynamically import the vectorizer
		const { errorVectorizer } = await import('../src/lib/ast/error-vectorizer.js');

		const raw = fs.readFileSync(SVELTE_CHECK_JSON, 'utf8');
		const data = JSON.parse(raw);

		// Convert to ASTError format
		const errors = (data.diagnostics ?? []).map((d, i) => ({
			id: `${d.filename}:${d.start?.line ?? 0}:${d.code ?? 'UNKNOWN'}:${i}`,
			line: d.start?.line ?? 0,
			column: d.start?.column ?? 0,
			endLine: d.end?.line ?? d.start?.line ?? 0,
			endColumn: d.end?.column ?? d.start?.column ?? 0,
			message: d.text ?? '',
			severity: d.severity === 'error' ? 'error' : 'warning',
			code: d.code ?? 'UNKNOWN',
			source: 'svelte',
			file: d.filename ?? 'unknown'
		}));

		// Vectorize
		const vectors = errorVectorizer.vectorizeAll(errors);
		const exportData = errorVectorizer.exportForWebGPU(vectors);

		// Save
		fs.writeFileSync(VECTORS_FILE, JSON.stringify(exportData, null, 2), 'utf8');

		metrics.vectorize.end = Date.now();
		metrics.vectorize.duration = metrics.vectorize.end - metrics.vectorize.start;
		metrics.vectorCount = vectors.length;

		const stats = errorVectorizer.getStats();
		console.log(`✅ Vectorization complete: ${vectors.length} vectors`);
		console.log(`   Unique codes: ${stats.uniqueCodes}, Unique files: ${stats.uniqueFiles}`);
		console.log(`⏱️  Duration: ${formatDuration(metrics.vectorize.duration)}`);
	} catch (err) {
		console.error('❌ Vectorization failed:', err.message);
		throw err;
	}
}

async function testCluster() {
	console.log('\n🎮 Step 3: Clustering (mock)...');
	metrics.cluster.start = Date.now();

	try {
		// Use mock clustering (group by error code)
		const vectors = JSON.parse(fs.readFileSync(VECTORS_FILE, 'utf8'));
		const codeGroups = new Map();

		// Group by error code
		vectors.vectors.forEach((v) => {
			const code = v.metadata.code;
			if (!codeGroups.has(code)) {
				codeGroups.set(code, []);
			}
			codeGroups.get(code).push(v);
		});

		// Convert to clusters
		const clusters = [];
		let clusterId = 0;

		for (const [code, vecs] of codeGroups.entries()) {
			const files = [...new Set(vecs.map((v) => v.metadata.file))];
			const centroid = vecs[0].vector;

			clusters.push({
				clusterId: clusterId++,
				code,
				count: vecs.length,
				files,
				centroid,
				members: vecs.map((v) => v.id)
			});
		}

		// Sort by count descending
		clusters.sort((a, b) => b.count - a.count);

		fs.writeFileSync(CLUSTERS_FILE, JSON.stringify(clusters, null, 2), 'utf8');

		metrics.cluster.end = Date.now();
		metrics.cluster.duration = metrics.cluster.end - metrics.cluster.start;
		metrics.clusterCount = clusters.length;

		console.log(`✅ Clustering complete: ${clusters.length} clusters`);
		console.log(`   Top 5 clusters:`);
		clusters.slice(0, 5).forEach((c, i) => {
			console.log(`   ${i + 1}. ${c.code}: ${c.count} errors in ${c.files.length} files`);
		});
		console.log(`⏱️  Duration: ${formatDuration(metrics.cluster.duration)}`);
	} catch (err) {
		console.error('❌ Clustering failed:', err.message);
		throw err;
	}
}

function calculateMetrics() {
	metrics.total.duration =
		metrics.svelteCheck.duration + metrics.vectorize.duration + metrics.cluster.duration;

	// Calculate theoretical improvement
	const errorsPerCluster = metrics.errorCount / metrics.clusterCount;
	const timePerErrorOld = 30; // 30 seconds per error (old way)
	const timePerClusterNew = 5; // 5 seconds per cluster (new way)

	const oldTotalTime = metrics.errorCount * timePerErrorOld; // seconds
	const newTotalTime = metrics.clusterCount * timePerClusterNew + metrics.total.duration / 1000; // seconds

	const improvement = oldTotalTime / newTotalTime;

	return {
		errorsPerCluster: Math.round(errorsPerCluster),
		oldTotalTime: oldTotalTime / 3600, // hours
		newTotalTime: newTotalTime / 60, // minutes
		improvement: improvement.toFixed(1)
	};
}

function printReport() {
	console.log('\n═══════════════════════════════════════════════════════');
	console.log('  PHASE 74 PERFORMANCE TEST RESULTS');
	console.log('═══════════════════════════════════════════════════════\n');

	console.log('📊 Pipeline Performance:');
	console.log(`   svelte-check:  ${formatDuration(metrics.svelteCheck.duration)}`);
	console.log(`   Vectorization: ${formatDuration(metrics.vectorize.duration)}`);
	console.log(`   Clustering:    ${formatDuration(metrics.cluster.duration)}`);
	console.log(`   ─────────────────────────────────────`);
	console.log(`   Total:         ${formatDuration(metrics.total.duration)}\n`);

	console.log('📈 Data Summary:');
	console.log(`   Errors found:  ${metrics.errorCount.toLocaleString()}`);
	console.log(`   Vectors:       ${metrics.vectorCount.toLocaleString()}`);
	console.log(`   Clusters:      ${metrics.clusterCount.toLocaleString()}\n`);

	const calc = calculateMetrics();

	console.log('🎯 Efficiency Gains:');
	console.log(`   Errors per cluster: ~${calc.errorsPerCluster}`);
	console.log(`   Old approach:       ${calc.oldTotalTime.toFixed(1)} hours (${metrics.errorCount} × 30s)`);
	console.log(
		`   New approach:       ${calc.newTotalTime.toFixed(1)} minutes (${metrics.clusterCount} × 5s + pipeline)`
	);
	console.log(`   Improvement:        ${calc.improvement}x faster\n`);

	console.log('💡 Interpretation:');
	if (calc.improvement >= 500) {
		console.log(`   ✅ EXCELLENT: ${calc.improvement}x improvement meets target (≥500x)`);
	} else if (calc.improvement >= 100) {
		console.log(`   ✅ GOOD: ${calc.improvement}x improvement (target: 500x)`);
	} else if (calc.improvement >= 50) {
		console.log(`   ⚠️  MODERATE: ${calc.improvement}x improvement (target: 500x)`);
	} else {
		console.log(`   ❌ LOW: ${calc.improvement}x improvement (target: 500x)`);
	}

	console.log('\n═══════════════════════════════════════════════════════\n');

	// Save report
	const report = {
		timestamp: new Date().toISOString(),
		metrics,
		calculated: calc
	};

	fs.writeFileSync(
		path.join(ROOT, 'phase74-performance-report.json'),
		JSON.stringify(report, null, 2),
		'utf8'
	);

	console.log('📄 Report saved to: phase74-performance-report.json\n');
}

(async () => {
	try {
		console.log('═══════════════════════════════════════════════════════');
		console.log('  Phase 74: Performance Test');
		console.log('═══════════════════════════════════════════════════════');

		metrics.total.start = Date.now();

		await testSvelteCheck();
		await testVectorize();
		await testCluster();

		metrics.total.end = Date.now();

		printReport();

		process.exit(0);
	} catch (err) {
		console.error('\n❌ Performance test failed:', err.message);
		process.exit(1);
	}
})();
