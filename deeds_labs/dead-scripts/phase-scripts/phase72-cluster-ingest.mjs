#!/usr/bin/env node
/**
 * Phase 74: Ingest WebGPU clusters into Phase72
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SESSION_ID = process.env.PHASE72_SESSION_ID ?? 'phase72:deeds-web-app:main';
const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';
const CLUSTERS_FILE = path.join(ROOT, 'svelte-check-clusters.json');

async function loadClusters() {
	if (!fs.existsSync(CLUSTERS_FILE)) {
		throw new Error(`Clusters file not found: ${CLUSTERS_FILE}`);
	}

	const raw = fs.readFileSync(CLUSTERS_FILE, 'utf8');
	return JSON.parse(raw);
}

async function sendToPhase72(clusters) {
	// Send overall summary
	const summary = {
		total_clusters: clusters.length,
		total_errors: clusters.reduce((sum, c) => sum + c.count, 0),
		top_clusters: clusters.slice(0, 10).map((c) => ({
			id: c.clusterId,
			code: c.code,
			count: c.count,
			files: c.files.length
		}))
	};

	console.log(`📤 Sending summary: ${summary.total_clusters} clusters, ${summary.total_errors} errors`);

	const res = await fetch(`${BACKEND}/api/phase72/record_event`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			session_id: SESSION_ID,
			kind: 'cluster-summary',
			description: `Formed ${clusters.length} error clusters (${summary.total_errors} total errors)`,
			payload: summary
		})
	});

	if (!res.ok) {
		throw new Error(`Phase72 record_event failed: ${res.status} ${await res.text()}`);
	}

	console.log('✅ Summary sent');

	// Send individual cluster events (top 20)
	console.log('📤 Sending top 20 cluster details...');
	for (const cluster of clusters.slice(0, 20)) {
		await fetch(`${BACKEND}/api/phase72/record_event`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				session_id: SESSION_ID,
				kind: 'cluster-formed',
				description: `Cluster ${cluster.clusterId}: ${cluster.code} (${cluster.count} errors)`,
				payload: {
					cluster_id: cluster.clusterId,
					code: cluster.code,
					count: cluster.count,
					files: cluster.files,
					centroid: cluster.centroid,
					priority: cluster.count > 1000 ? 'high' : cluster.count > 100 ? 'medium' : 'low'
				}
			})
		});
	}

	console.log('✅ Cluster details sent');
}

(async () => {
	try {
		console.log('📊 Loading WebGPU clusters...');
		const clusters = await loadClusters();
		console.log(`✅ Loaded ${clusters.length} clusters`);

		console.log('📤 Sending to Phase72...');
		await sendToPhase72(clusters);
		console.log('✅ Phase72 timeline updated with cluster data');

		process.exit(0);
	} catch (err) {
		console.error('❌ Phase72 cluster ingest failed:', err);
		process.exit(1);
	}
})();
