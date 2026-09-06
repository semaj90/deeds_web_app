#!/usr/bin/env node
/**
 * Live proof for DOC-06A (EXTERNAL_DOC_POSTGRES_ADMISSION_01) --
 * admitExternalDocPage / retrieveExternalDocs against the real Postgres
 * database. Not a mock: connects via `pg.Pool` directly (per this repo's own
 * "connect directly via pg.Pool, never spawn Docker from Node" rule),
 * exercises admission, idempotent replay, checksum-mismatch rejection, and
 * DOC-27's fail-closed version lookup, then cleans up every row it wrote.
 *
 * Run from sveltekit-frontend/ (module resolution for `pg` must match the
 * admission module's own resolution -- running from the repo root instead
 * hits a duplicate @types/pg across workspaces, a structural TS mismatch
 * even though it's the same package at runtime):
 *   npx tsx scripts/atlas/prove-doc-06a-admission-v1.mts
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

import {
	admitExternalDocPage,
	retrieveExternalDocs,
	type ExternalDocAdmissionInputV1
} from '../../src/lib/server/atlas/docs/external-doc-admission.js';

function sha256(text: string): string {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

function buildFixture(): ExternalDocAdmissionInputV1 {
	const text0 = 'Tile IR overview text for sm_86 kernel programming.';
	const text1 = 'API section: cutile.tile_load(ptr, shape) loads a tile.';
	return {
		manifestRevision: 'doc-06a-proof-r1',
		sourceRevision: 'nvidia-tile-ir-2026-09-04',
		page: {
			provider: 'nvidia',
			product: 'cuda-tile-ir',
			productVersion: '13.2',
			architecture: 'sm_86',
			language: 'python',
			url: 'https://docs.nvidia.com/cuda/tile-ir/13.2/doc-06a-proof/',
			title: 'Tile IR (DOC-06A proof fixture)',
			publisher: 'NVIDIA',
			sourceAuthority: 'OFFICIAL',
			fetcher: 'BEAUTIFULSOUP_HTTP',
			crawlRevision: 'crawl-r1',
			parserRevision: 'atlas_external_docs.py@doc-06a-proof',
			contentHash: sha256(text0 + text1),
			evidenceRevision: sha256(
				JSON.stringify({
					provider: 'nvidia',
					product: 'cuda-tile-ir',
					product_version: '13.2',
					url: 'https://docs.nvidia.com/cuda/tile-ir/13.2/doc-06a-proof/',
					section_anchor: null,
					content_hash: sha256(text0 + text1)
				})
			),
			retrievedAt: new Date().toISOString()
		},
		chunks: [
			{
				chunkId: 'doc:doc-06a-proof:0000000000000000:0',
				ordinal: 0,
				headingPath: ['Usage'],
				sectionAnchor: 'Usage',
				startChar: 0,
				endChar: text0.length,
				startByte: 0,
				endByte: Buffer.byteLength(text0, 'utf8'),
				text: text0,
				domainClass: 'gpu',
				ontologyClasses: ['ALGORITHM'],
				codeBlocks: [],
				apiSignatures: [],
				chunkChecksum: sha256(text0),
				evidenceRevision: sha256(`chunk0:${text0}`)
			},
			{
				chunkId: 'doc:doc-06a-proof:0000000000000000:1',
				ordinal: 1,
				headingPath: ['API'],
				sectionAnchor: 'API',
				startChar: text0.length,
				endChar: text0.length + text1.length,
				startByte: Buffer.byteLength(text0, 'utf8'),
				endByte: Buffer.byteLength(text0, 'utf8') + Buffer.byteLength(text1, 'utf8'),
				text: text1,
				domainClass: 'gpu',
				ontologyClasses: ['API'],
				codeBlocks: [],
				apiSignatures: ['cutile.tile_load(ptr, shape)'],
				chunkChecksum: sha256(text1),
				evidenceRevision: sha256(`chunk1:${text1}`)
			}
		]
	};
}

async function cleanup(pool: Pool, url: string): Promise<void> {
	await pool.query(
		`DELETE FROM atlas_external_doc_chunks WHERE page_id IN
		   (SELECT id FROM atlas_external_doc_pages WHERE url = $1)`,
		[url]
	);
	await pool.query(`DELETE FROM atlas_external_doc_pages WHERE url = $1`, [url]);
}

async function main(): Promise<void> {
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set (expected from .env/.env.local)');
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const results: Record<string, boolean> = {};
	const fixture = buildFixture();

	try {
		await cleanup(pool, fixture.page.url);

		// 1. First admission
		const receipt1 = await admitExternalDocPage(pool, fixture);
		results['admission_committed'] = receipt1.transactionCommitted && receipt1.writesPerformed;
		results['chunk_count_matches'] = receipt1.chunkCount === fixture.chunks.length;
		results['checksums_match_expected_and_readback'] = receipt1.expectedChecksums.every(
			(checksum, i) => checksum === receipt1.readbackChecksums[i]
		);
		results['version_qualified'] = receipt1.versionQualified === true;
		results['architecture_qualified'] = receipt1.architectureQualified === true;

		// 2. Idempotent replay: identical input, must not error, must not duplicate rows
		const receipt2 = await admitExternalDocPage(pool, fixture);
		results['idempotent_replay_same_page_id'] = receipt2.pageId === receipt1.pageId;
		const countAfterReplay = await pool.query(
			'SELECT count(*)::int AS n FROM atlas_external_doc_chunks WHERE page_id = $1',
			[receipt1.pageId]
		);
		results['idempotent_replay_no_duplicate_rows'] = countAfterReplay.rows[0].n === fixture.chunks.length;

		// 3. Checksum mismatch: rejected before any write is attempted (pre-transaction
		// validation, not a mid-transaction rollback -- checked here that it produces
		// the same end effect: zero extra rows).
		const corrupted: ExternalDocAdmissionInputV1 = {
			...fixture,
			page: { ...fixture.page, evidenceRevision: `${fixture.page.evidenceRevision}-corrupt` },
			chunks: fixture.chunks.map((chunk, i) =>
				i === 0
					? { ...chunk, chunkChecksum: 'deadbeef'.repeat(8), evidenceRevision: `${chunk.evidenceRevision}-corrupt` }
					: { ...chunk, evidenceRevision: `${chunk.evidenceRevision}-corrupt` }
			)
		};
		let rejectedCorrupted = false;
		try {
			await admitExternalDocPage(pool, corrupted);
		} catch (error) {
			rejectedCorrupted = error instanceof Error && error.message.startsWith('ADMISSION_CHUNK_CHECKSUM_MISMATCH');
		}
		results['corrupted_checksum_rejected'] = rejectedCorrupted;
		const countAfterCorrupted = await pool.query(
			'SELECT count(*)::int AS n FROM atlas_external_doc_pages WHERE url = $1',
			[fixture.page.url]
		);
		results['corrupted_input_did_not_create_extra_page_row'] = countAfterCorrupted.rows[0].n === 1;

		// 4. DOC-27 read-side: requested version exists -> FOUND
		const found = await retrieveExternalDocs(pool, {
			provider: fixture.page.provider,
			product: fixture.page.product,
			productVersion: fixture.page.productVersion,
			architecture: fixture.page.architecture
		});
		results['doc27_found_when_indexed'] = found.status === 'FOUND' && found.pages.length === 1;

		// 5. DOC-27 read-side: requested version does NOT exist -> fail closed, never substitute
		const notIndexed = await retrieveExternalDocs(pool, {
			provider: fixture.page.provider,
			product: fixture.page.product,
			productVersion: '13.3'
		});
		results['doc27_version_not_indexed_when_missing'] =
			notIndexed.status === 'VERSION_NOT_INDEXED' &&
			notIndexed.availableVersions.includes('13.2') &&
			!notIndexed.availableVersions.includes('13.3');

		// 6. Genuinely different content under the SAME (provider,product,productVersion,url)
		// must fail loudly, not silently overwrite -- an operator must decide explicitly when
		// content changes under an unchanged version/url. Different content_hash -> different
		// evidence_revision -> ON CONFLICT (evidence_revision) doesn't fire -> the OTHER unique
		// constraint (provider,product,product_version,url) fires instead, as a real error.
		const differentContentText = 'A completely different page body under the same version+url.';
		const sameIdentityDifferentContent: ExternalDocAdmissionInputV1 = {
			...fixture,
			page: {
				...fixture.page,
				contentHash: sha256(differentContentText),
				evidenceRevision: sha256(
					JSON.stringify({
						provider: fixture.page.provider,
						product: fixture.page.product,
						product_version: fixture.page.productVersion,
						url: fixture.page.url,
						section_anchor: null,
						content_hash: sha256(differentContentText)
					})
				)
			},
			chunks: [
				{
					...fixture.chunks[0],
					text: differentContentText,
					chunkChecksum: sha256(differentContentText),
					evidenceRevision: sha256(`different-content-chunk:${differentContentText}`)
				}
			]
		};
		let rejectedSameIdentityDifferentContent = false;
		try {
			await admitExternalDocPage(pool, sameIdentityDifferentContent);
		} catch (error) {
			rejectedSameIdentityDifferentContent =
				error instanceof Error && /duplicate key value violates unique constraint/.test(error.message);
		}
		results['same_identity_different_content_fails_loudly_not_silent_overwrite'] =
			rejectedSameIdentityDifferentContent;
		const pageStillOriginal = await pool.query(
			'SELECT content_hash FROM atlas_external_doc_pages WHERE url = $1',
			[fixture.page.url]
		);
		results['original_content_untouched_after_rejected_conflict'] =
			pageStillOriginal.rows[0]?.content_hash === fixture.page.contentHash;

		await cleanup(pool, fixture.page.url);
		const cleanupCheck = await pool.query('SELECT count(*)::int AS n FROM atlas_external_doc_pages WHERE url = $1', [
			fixture.page.url
		]);
		results['cleanup_verified_empty'] = cleanupCheck.rows[0].n === 0;
	} finally {
		await pool.end();
	}

	const allPassed = Object.values(results).every(Boolean);
	console.log(JSON.stringify({ status: allPassed ? 'PASS' : 'FAIL', results }, null, 2));
	if (!allPassed) process.exitCode = 1;
}

main().catch((error) => {
	console.error('[doc-06a-admission-proof]', error);
	process.exitCode = 1;
});
