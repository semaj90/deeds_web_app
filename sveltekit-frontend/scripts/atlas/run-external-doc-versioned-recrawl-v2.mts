#!/usr/bin/env node
/**
 * DOC-26 V2 admission composition. Default mode is exact read-only planning.
 * --apply requires an explicit operator gate and writes only through the
 * existing admitExternalDocPage owner; prior-version envelopes are read back
 * exactly before and after the new-version admission.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import {
	prepareVersionedRecrawlBatchV2,
	reconcileVersionedRecrawlAdmissionV2,
	type ManifestRecrawlDeltaV1
} from '../../src/lib/server/atlas/docs/external-doc-versioned-recrawl-admission-v2.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const args = process.argv.slice(2);
const value = (name: string): string => {
	const index = args.indexOf(name);
	if (index < 0 || !args[index + 1]) throw new Error(`REQUIRED_ARGUMENT:${name}`);
	return resolve(process.cwd(), args[index + 1]);
};
const apply = args.includes('--apply');
const AUTH = 'I_AUTHORIZE_DOC_VERSIONED_RECRAWL';
const RECEIPT = resolve(ROOT, 'docs/reports/parent-atlas/doc-26-versioned-recrawl-admission-v2.json');

async function main(): Promise<void> {
	if (args.includes('--help')) {
		console.log('run-external-doc-versioned-recrawl-v2.mts --delta-plan FILE --prior-envelopes FILE --current-envelopes FILE [--apply]');
		return;
	}
	if (args.includes('--plan-only') && apply) throw new Error('PLAN_ONLY_AND_APPLY_ARE_MUTUALLY_EXCLUSIVE');
	if (apply && process.env.ATLAS_DOC_VERSIONED_RECRAWL_AUTHORIZED !== AUTH) {
		throw new Error(`DOC_RECRAWL_NOT_AUTHORIZED: set ATLAS_DOC_VERSIONED_RECRAWL_AUTHORIZED=${AUTH}`);
	}
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
	const delta = JSON.parse(readFileSync(value('--delta-plan'), 'utf8')) as ManifestRecrawlDeltaV1;
	const priorEnvelopes = JSON.parse(readFileSync(value('--prior-envelopes'), 'utf8')) as unknown;
	const currentEnvelopes = JSON.parse(readFileSync(value('--current-envelopes'), 'utf8')) as unknown;
	const batch = prepareVersionedRecrawlBatchV2(delta, priorEnvelopes, currentEnvelopes);
	const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, statement_timeout: 15000 });
	try {
		const outcome = apply
			? await reconcileVersionedRecrawlAdmissionV2(pool, batch, 'APPLY')
			: await (async () => {
				const client = await pool.connect();
				try {
					await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
					return await reconcileVersionedRecrawlAdmissionV2({ query: client.query.bind(client) } as never, batch, 'PLAN_ONLY');
				} finally {
					try { await client.query('ROLLBACK'); } finally { client.release(); }
				}
			})();
		const result = apply
			? outcome.result === 'ADMITTED_AND_PRIOR_PRESERVED' ? 'DOC_26_VERSIONED_RECRAWL_ADMITTED_PRIOR_PRESERVED' : 'DOC_26_VERSIONED_RECRAWL_CONFLICT'
			: outcome.result === 'PLAN_ONLY' ? 'DOC_26_VERSIONED_RECRAWL_PLAN_PROVEN' : 'DOC_26_VERSIONED_RECRAWL_CONFLICT';
		const receipt = {
			schema: 'atlas.doc-26.versioned-recrawl-admission.v2', generatedAt: new Date().toISOString(),
			mode: apply ? 'APPLY' : 'PLAN_ONLY', canonicalWriter: 'admitExternalDocPage',
			deltaPlanChecksum: delta.planChecksum, previousManifestRevision: delta.previousManifestRevision,
			currentManifestRevision: delta.currentManifestRevision, selectedSourceIds: batch.selectedSourceIds,
			versionTransitions: batch.versionTransitions,
			prior: {
				expectedPages: batch.prior.length, ...outcome.priorPlan, preserved: outcome.priorPreserved,
				beforeSnapshotChecksum: outcome.priorSnapshotBeforeChecksum,
				afterSnapshotChecksum: outcome.priorSnapshotAfterChecksum
			},
			current: { expectedPages: batch.current.length, ...outcome.currentPlan },
			writerCalls: outcome.writerCalls, result,
			writes: { postgres: apply ? 'COMMITTED_IF_MISSING' : 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 }
		};
		writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
		console.log(JSON.stringify(receipt, null, 2));
		if (outcome.result === 'CONFLICT') process.exitCode = 1;
	} finally {
		await pool.end();
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
