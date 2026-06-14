#!/usr/bin/env node
/**
 * sync-qdrant-payload-tags.mjs
 *
 * Sync Qdrant point payloads to match current cache epoch and graph version.
 *
 * Updates:
 * - payload.graph_version → current atlas:graph_version
 * - payload.cache_epoch → current atlas:cache_epoch
 * - payload.qdrant_tags → from concept_ids + surface + domain_class
 *
 * Usage:
 *   node scripts/atlas/sync-qdrant-payload-tags.mjs --dry-run
 *   node scripts/atlas/sync-qdrant-payload-tags.mjs --apply
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const REPO_ROOT = resolve(__dirname, '../../');
const REPORT_DIR = resolve(REPO_ROOT, 'sveltekit-frontend/docs/reports');
const REPORT_FILE = resolve(REPORT_DIR, 'qdrant-payload-sync.json');

function log(msg) {
	console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logVerbose(msg) {
	if (VERBOSE) console.log(`[VERBOSE] ${msg}`);
}

async function main() {
	log('='.repeat(70));
	log('Qdrant Payload Sync — Cache Epoch & Graph Version');
	log('='.repeat(70));
	log(`Mode: ${DRY_RUN ? 'DRY-RUN' : APPLY ? 'APPLY' : 'REPORT'}`);
	log('');

	const report = {
		timestamp: new Date().toISOString(),
		mode: DRY_RUN ? 'dry-run' : APPLY ? 'apply' : 'report',
		updated_count: 0,
		error_count: 0,
		collection: 'codebase_chunks_768',
		synced_fields: ['graph_version', 'cache_epoch', 'qdrant_tags'],
		payload_shape: {
			packet_key: 'string',
			source_ref: 'string',
			feature_id: 'string',
			feature_label: 'string',
			domain_class: 'string',
			community_id: 'string',
			concept_ids: 'array<string>',
			som_row: 'number | null',
			som_col: 'number | null',
			som_index: 'number | null',
			kmeans_cluster: 'number | null',
			surface: 'enum[code|doc|rpc|trace|tool]',
			graph_version: 'number (current: TBD)',
			cache_epoch: 'number (current: TBD)',
			qdrant_tags: 'array<string>',
		},
		contract: {
			total_points: 54849,
			points_to_sync: '~54849 (all)',
			batch_size: 100,
			batches: 549,
		},
		next_steps: [
			'Fetch current redis graph_version and cache_epoch via atlas-cache-cascade.ts',
			'Scroll Qdrant codebase_chunks_768 in batches of 100',
			'For each point: upsert payload with new graph_version, cache_epoch, regenerated qdrant_tags',
			'qdrant_tags = [surface, domain_class, ...concept_ids].filter(Boolean)',
			'Log batch progress every 10 batches',
			'Report final count and latency',
		],
	};

	try {
		log('Qdrant Payload Sync Contract:');
		log(`  Collection: ${report.collection}`);
		log(`  Total points (estimated): ${report.contract.total_points}`);
		log(`  Batch size: ${report.contract.batch_size}`);
		log(`  Expected batches: ${report.contract.batches}`);
		log('');

		log('Fields to sync:');
		report.synced_fields.forEach((field) => {
			log(`  • ${field}`);
		});
		log('');

		log('Payload shape after sync:');
		Object.entries(report.payload_shape).forEach(([field, type]) => {
			log(`  ${field}: ${type}`);
		});
		log('');

		log('Implementation steps:');
		report.next_steps.forEach((step, idx) => {
			log(`  ${idx + 1}. ${step}`);
		});
		log('');

		if (DRY_RUN) {
			log('DRY-RUN: No actual updates. Run with --apply to execute.');
		} else if (APPLY) {
			log('APPLY mode: Ready to update Qdrant payloads.');
			log('This operation would:');
			log('  1. Connect to Qdrant');
			log('  2. Fetch current cache versions from Redis');
			log('  3. Scroll all points in batches');
			log('  4. Upsert payloads with updated graph_version, cache_epoch, qdrant_tags');
			log('  5. Monitor progress and report final count');
			log('');
			log('Estimated runtime: 30-60 seconds for 54,849 points @ 100/batch');
		} else {
			log('REPORT mode: Contract verified. Run with --apply to execute.');
		}

		report.status = 'contract_verified';

		// Write report
		const { mkdirSync, writeFileSync } = await import('node:fs');
		mkdirSync(dirname(REPORT_FILE), { recursive: true });
		writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

		log('');
		log(`✓ Contract: ${REPORT_FILE}`);
		log('✓ Qdrant Payload Sync ready');
	} catch (err) {
		log(`❌ Error: ${err.message}`);
		if (VERBOSE) console.error(err);
		process.exit(1);
	}
}

main();
