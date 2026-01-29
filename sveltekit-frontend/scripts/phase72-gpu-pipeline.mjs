#!/usr/bin/env node
/**
 * Phase 74: Complete GPU-accelerated error analysis pipeline
 * svelte-check → vectorize → WebGPU cluster → Phase72 ingest
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VECTORS_FILE = path.join(ROOT, 'svelte-check-vectors.json');
const CLUSTERS_FILE = path.join(ROOT, 'svelte-check-clusters.json');

function run(cmd, args, opts = {}) {
	return new Promise((resolve, reject) => {
		console.log(`🚀 Running: ${cmd} ${args.join(' ')}`);
		const proc = spawn(cmd, args, {
			stdio: 'inherit',
			shell: true,
			cwd: ROOT,
			...opts
		});
		proc.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${cmd} exited with code ${code}`));
		});
	});
}

(async () => {
	try {
		console.log('═══════════════════════════════════════════════════════');
		console.log('  Phase 74: GPU-Accelerated Error Analysis Pipeline');
		console.log('═══════════════════════════════════════════════════════\n');

		// Step 1: Run svelte-check and vectorize
		console.log('📝 Step 1: Running svelte-check + vectorization...');
		await run('node', ['scripts/phase72-svelte-check-vectorize.mjs']);
		console.log(`✅ Vectors saved to: ${VECTORS_FILE}\n`);

		// Step 2: Run WebGPU SOM clustering
		console.log('🎮 Step 2: Running WebGPU SOM clustering...');

		// Check if WebGPU script exists
		const webgpuScript = path.join(ROOT, 'scripts', 'gpu-cluster-concurrent-executor.mjs');
		if (fs.existsSync(webgpuScript)) {
			await run('npx', [
				'zx',
				'scripts/gpu-cluster-concurrent-executor.mjs',
				'--input',
				VECTORS_FILE,
				'--output',
				CLUSTERS_FILE
			]);
		} else {
			console.log('⚠️  WebGPU script not found, using mock clustering...');
			// Create mock clusters for testing
			const vectors = JSON.parse(fs.readFileSync(VECTORS_FILE, 'utf8'));
			const mockClusters = createMockClusters(vectors);
			fs.writeFileSync(CLUSTERS_FILE, JSON.stringify(mockClusters, null, 2), 'utf8');
		}
		console.log(`✅ Clusters saved to: ${CLUSTERS_FILE}\n`);

		// Step 3: Ingest clusters into Phase72
		console.log('📤 Step 3: Ingesting clusters into Phase72...');
		await run('node', ['scripts/phase72-cluster-ingest.mjs']);
		console.log('✅ Phase72 timeline updated\n');

		console.log('═══════════════════════════════════════════════════════');
		console.log('  ✅ Pipeline Complete!');
		console.log('═══════════════════════════════════════════════════════');
		console.log('\nNext: Run ACE to plan fixes based on clusters:');
		console.log('  npm run ace:plan\n');

		process.exit(0);
	} catch (err) {
		console.error('\n❌ Pipeline failed:', err.message);
		process.exit(1);
	}
})();

/**
 * Create mock clusters for testing (when WebGPU not available)
 */
function createMockClusters(vectorData) {
	const codeGroups = new Map();
	const features = vectorData.features || [];
	const vectors = vectorData.vectors || [];

	// Group by identifier (file + severity/line approx)
	features.forEach((f, i) => {
		const code = f.code || 'SVELTE_CHECK_ERROR';
		if (!codeGroups.has(code)) {
			codeGroups.set(code, []);
		}
		codeGroups.get(code).push({
			id: `err-${i}`,
			vector: vectors[i],
			metadata: f
		});
	});

	// Convert to clusters
	const clusters = [];
	let clusterId = 0;

	for (const [code, members] of codeGroups.entries()) {
		const files = [...new Set(members.map((m) => m.metadata.filename || m.metadata.file))];
		const centroid = members[0].vector; // Use first vector as centroid

		clusters.push({
			clusterId: clusterId++,
			title: `Cluster: ${code}`,
			code,
			count: members.length,
			files,
			centroid,
			members: members.map((m) => m.id),
			sampleMessage: members[0].metadata.message
		});
	}

	// Sort by count descending
	clusters.sort((a, b) => b.count - a.count);

	return clusters;
}
