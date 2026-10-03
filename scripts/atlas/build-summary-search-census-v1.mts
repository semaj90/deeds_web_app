#!/usr/bin/env node
/**
 * SUMMARY-CENSUS-01/02: immutable PostgreSQL-derived snapshot of legacy chunk summaries.
 * PostgreSQL is read-only; summary text is carried byte-for-byte into local 5k-row shards.
 * Legacy text/vector data is HINT only and never establishes current identity or canonical representation.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { analyzeSummaryContaminationV1 } from './lib/summary-quality-v1.mjs';
import { summarySearchCensusRowV1Schema } from '../../packages/parent-atlas/src/core/summary-search-census-v1.ts';

const args = new Map(process.argv.slice(2).map((arg) => {
	const index = arg.indexOf('=');
	return index < 0 ? [arg.replace(/^--/, ''), 'true'] : [arg.slice(2, index), arg.slice(index + 1)];
}));
const workspaceRevision = args.get('workspace-revision') ?? 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
const repositoryId = args.get('repository-id') ?? 'deeds-web-app';
const batchSize = Math.min(5000, Math.max(100, Number(args.get('batch') ?? 1000)));
const shardSize = Math.min(5000, Math.max(100, Number(args.get('shard') ?? 5000)));
const hintPathArg = args.get('hint-representations') ?? '.tmp/atlas/legacy-summary-hint-embedding-v1/20260926T062011Z/representations-00001.ndjson';
const hintPath = path.resolve(REPO_ROOT, hintPathArg);
const sha256 = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outputRoot = path.join(REPO_ROOT, '.tmp/atlas/summary-search-census-v1', stamp);
fs.mkdirSync(outputRoot, { recursive: true });

const hintVectors = new Map();
if (fs.existsSync(hintPath)) {
	for (const line of fs.readFileSync(hintPath, 'utf8').split(/\r?\n/)) {
		if (!line.trim()) continue;
		const item = JSON.parse(line);
		if (item.schema === 'atlas.summary-hint-representation.v1' && item.canonicalAuthority === false) {
			hintVectors.set(item.chunkRowId, { digest: item.summaryDigest, vectorDigest: item.vectorDigest });
		}
	}
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });
const client = await pool.connect();
const beforeCounts = async () => (await client.query(`
	SELECT count(*)::int AS chunk_rows,
	       count(*) FILTER (WHERE summary IS NOT NULL AND btrim(summary) <> '')::int AS legacy_summaries,
	       count(*) FILTER (WHERE summary_embedding IS NOT NULL)::int AS legacy_vectors,
	       count(*) FILTER (WHERE summary_text IS NOT NULL)::int AS admitted_summary_text
	FROM public.codebase_chunk_index
`)).rows[0];

const acceptedShards = [];
const rejectedShards = [];
const acceptedHash = crypto.createHash('sha256');
const sourceCohortHash = crypto.createHash('sha256');
const rejectedHash = crypto.createHash('sha256');
const tally = {
	rowsRead: 0, accepted: 0, rejected: 0, bySummaryState: {}, byIdentityState: {},
	legacyVectorPresent: 0, hintRepresentationPresent: 0, routingPresence: { domain: 0, community: 0, cluster: 0, somCell: 0, pageRank: 0 },
	peakBatchRows: 0, totalExpected: 0,
};
let acceptedStream = null;
let rejectedStream = null;
let acceptedShardHash = null;
let rejectedShardHash = null;
let acceptedShardRows = 0;
let rejectedShardRows = 0;
let acceptedShardIndex = 0;
let rejectedShardIndex = 0;
let acceptedBytes = 0;
let rejectedBytes = 0;
let lastId = '00000000-0000-0000-0000-000000000000';
let ordinal = 0;

function createShard(kind, index) {
	const name = `${kind}-${String(index).padStart(5, '0')}.ndjson`;
	const stream = fs.createWriteStream(path.join(outputRoot, name), { flags: 'wx' });
	return { name, stream, hash: crypto.createHash('sha256'), rows: 0 };
}
async function writeLine(shard, line) {
	if (!shard.stream.write(line)) await new Promise((resolve, reject) => {
		const cleanup = () => {
			shard.stream.off('drain', onDrain);
			shard.stream.off('error', onError);
		};
		const onDrain = () => { cleanup(); resolve(); };
		const onError = (error) => { cleanup(); reject(error); };
		shard.stream.once('drain', onDrain);
		shard.stream.once('error', onError);
	});
	shard.hash.update(line);
	shard.rows++;
}
async function closeShard(shard, list) {
	if (!shard) return;
	await new Promise((resolve, reject) => {
		shard.stream.once('error', reject);
		shard.stream.end(resolve);
	});
	list.push({ path: shard.name, rows: shard.rows, sha256: `sha256:${shard.hash.digest('hex')}` });
}
function numeric(value) {
	if (value === null || value === undefined || value === '') return null;
	const out = Number(value);
	return Number.isFinite(out) ? out : null;
}
function ext(value) {
	const base = String(value ?? '').split(/[\\/]/).pop() ?? '';
	const index = base.lastIndexOf('.');
	return index > 0 ? base.slice(index).toLowerCase() : null;
}

try {
	await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
	const before = await beforeCounts();
	tally.totalExpected = before.legacy_summaries;
	for (;;) {
		const result = await client.query(`
			SELECT ci.id::text AS chunk_row_id, ci.chunk_id, ci.source_ref AS observed_source_ref,
			       nullif(btrim(ci.summary), '') AS summary, ci.summary_embedding IS NOT NULL AS legacy_vector_present,
			       ci.language, ci.metadata,
			       to_jsonb(ci)->'summary_embedding_meta' AS summary_embedding_meta,
			       l.canonical_chunk_id, l.packet_key AS observed_packet_key, l.source_ref AS lineage_source_ref,
			       l.source_revision AS lineage_source_revision, l.revision_status,
			       coalesce(l.lineage_count, 0)::int AS lineage_count,
			       coalesce(b.binding_count, 0)::int AS binding_count, b.binding_checksum,
			       (ap.packet_key IS NOT NULL) AS packet_exists,
			       ap.domain_class, ap.community_id, coalesce(ap.cluster_id, ap.kmeans_cluster) AS cluster_id,
			       ap.som_cell_x, ap.som_cell_y, coalesce(ap.pagerank_score, ap.pagerank) AS page_rank
			FROM public.codebase_chunk_index ci
			LEFT JOIN LATERAL (
				SELECT chosen.*, counts.lineage_count
				FROM (
					SELECT count(*)::int AS lineage_count FROM public.atlas_packet_chunk_lineage WHERE chunk_row_id = ci.id
				) counts
				LEFT JOIN LATERAL (
					SELECT x.* FROM public.atlas_packet_chunk_lineage x WHERE x.chunk_row_id = ci.id
					ORDER BY (x.revision_status = 'PROVEN') DESC, x.source_ref, x.packet_key LIMIT 1
				) chosen ON true
			) l ON true
			LEFT JOIN LATERAL (
				SELECT count(*)::int AS binding_count, min(binding_checksum) AS binding_checksum
				FROM public.atlas_workspace_source_bindings x
				WHERE x.repo_id = $1 AND x.workspace_revision = $2
				  AND x.canonical_source_ref = l.source_ref AND x.source_revision = l.source_revision
			) b ON true
			LEFT JOIN public.atlas_packets ap ON ap.packet_key = l.packet_key
			WHERE ci.id > $3::uuid AND ci.summary IS NOT NULL AND btrim(ci.summary) <> ''
			ORDER BY ci.id LIMIT $4
		`, [repositoryId, workspaceRevision, lastId, batchSize]);
		if (!result.rows.length) break;
		tally.peakBatchRows = Math.max(tally.peakBatchRows, result.rows.length);
		for (const row of result.rows) {
			lastId = row.chunk_row_id;
			tally.rowsRead++;
			ordinal++;
			const summaryText = row.summary;
			const digest = sha256(Buffer.from(summaryText, 'utf8'));
			sourceCohortHash.update(`${row.chunk_row_id}\0${digest}\n`, 'utf8');
			const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
			const quarantined = Object.prototype.hasOwnProperty.call(metadata, 'phase8_5_quarantine');
			const quality = analyzeSummaryContaminationV1(summaryText);
			const lineageExact = row.lineage_count === 1 && row.revision_status === 'PROVEN' && row.binding_count === 1 && !!row.binding_checksum
				&& row.chunk_id === row.canonical_chunk_id && row.packet_exists === true;
			const identityState = lineageExact ? 'REVISION_QUALIFIED' : 'LEGACY_IDENTITY_UNQUALIFIED';
			const summaryState = quarantined ? 'QUARANTINED' : !quality.clean ? 'CONTAMINATED' : lineageExact ? 'LEGACY_HINT_LINEAGE_BOUND' : 'LEGACY_HINT_UNQUALIFIED';
			const canonicalIdentity = lineageExact ? {
				canonicalChunkId: row.canonical_chunk_id ?? null,
				packetKey: row.observed_packet_key ?? null,
				sourceRef: row.lineage_source_ref ?? null,
				sourceRevision: row.lineage_source_revision ?? null,
				workspaceRevision,
			} : { canonicalChunkId: null, packetKey: null, sourceRef: null, sourceRevision: null, workspaceRevision: null };
			const hint = hintVectors.get(row.chunk_row_id);
			const hintPresent = !!hint && hint.digest === digest && /^sha256:[0-9a-f]{64}$/.test(hint.vectorDigest ?? '');
			const meta = row.summary_embedding_meta && typeof row.summary_embedding_meta === 'object' ? row.summary_embedding_meta : null;
			const repRevision = typeof meta?.representationRevision === 'string' ? meta.representationRevision : null;
			const pageRank = numeric(row.page_rank);
			const somCell = row.som_cell_x == null || row.som_cell_y == null ? null : [Number(row.som_cell_x), Number(row.som_cell_y)];
			const censusRow = {
				schema: 'atlas.summary-search-census-row.v1', ordinal,
				identity: {
					chunkRowId: row.chunk_row_id, ...canonicalIdentity,
					observedSourceRef: row.observed_source_ref ?? row.lineage_source_ref ?? null,
					observedPacketKey: row.observed_packet_key ?? null,
					state: identityState,
				},
				summary: {
					source: 'LEGACY_CHUNK_SUMMARY', text: summaryText, digest, byteLength: Buffer.byteLength(summaryText, 'utf8'),
					state: summaryState, qualityClean: quality.clean, quarantined, detectorRevision: 'summary-quality-v1',
				},
				representation: {
					representationId: 'semantic_768', canonicalSummaryVectorAvailable: false,
					legacyVectorPresent: row.legacy_vector_present === true, hintRepresentationAvailable: hintPresent,
					hintRepresentationRef: hintPresent ? path.relative(REPO_ROOT, hintPath).replaceAll('\\', '/') : null,
					hintVectorDigest: hintPresent ? hint.vectorDigest : null,
					representationRevision: repRevision,
				},
				routing: {
					domainClass: row.domain_class ?? null, language: row.language ?? null, fileKind: ext(row.observed_source_ref),
					communityId: numeric(row.community_id), clusterId: numeric(row.cluster_id), somCell,
					pageRank, provenance: 'UNVERSIONED_PROJECTION_HINT',
				},
				evidenceRefs: [
					`codebase_chunk_index:id=${row.chunk_row_id}`,
					...(lineageExact ? [`binding_checksum:${row.binding_checksum}`, `lineage_status:${row.revision_status}`] : []),
					...(quarantined ? ['metadata.phase8_5_quarantine'] : []),
				], canonicalAuthority: false,
			};
			const parsed = summarySearchCensusRowV1Schema.safeParse(censusRow);
			if (parsed.success) {
				if (!acceptedStream || acceptedShardRows >= shardSize) {
					await closeShard(acceptedStream, acceptedShards);
					acceptedStream = createShard('accepted', ++acceptedShardIndex);
					acceptedShardHash = acceptedStream.hash;
					acceptedShardRows = 0;
				}
				const line = `${JSON.stringify(parsed.data)}\n`;
				await writeLine(acceptedStream, line);
				acceptedHash.update(line);
				acceptedBytes += Buffer.byteLength(line);
				acceptedShardRows++;
				tally.accepted++;
				tally.bySummaryState[summaryState] = (tally.bySummaryState[summaryState] ?? 0) + 1;
				tally.byIdentityState[identityState] = (tally.byIdentityState[identityState] ?? 0) + 1;
				if (row.legacy_vector_present) tally.legacyVectorPresent++;
				if (hintPresent) tally.hintRepresentationPresent++;
				for (const [field, counter] of [['domainClass', 'domain'], ['communityId', 'community'], ['clusterId', 'cluster'], ['somCell', 'somCell'], ['pageRank', 'pageRank']]) {
					if (censusRow.routing[field] != null) tally.routingPresence[counter]++;
				}
			} else {
				if (!rejectedStream || rejectedShardRows >= shardSize) {
					await closeShard(rejectedStream, rejectedShards);
					rejectedStream = createShard('rejected', ++rejectedShardIndex);
					rejectedShardHash = rejectedStream.hash;
					rejectedShardRows = 0;
				}
				const line = `${JSON.stringify({ schema: 'atlas.summary-search-census-rejection.v1', ordinal, chunkRowId: row.chunk_row_id, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) })}\n`;
				await writeLine(rejectedStream, line);
				rejectedHash.update(line);
				rejectedBytes += Buffer.byteLength(line);
				rejectedShardRows++;
				tally.rejected++;
			}
		}
		const percent = tally.totalExpected ? Math.min(100, Math.floor(100 * tally.rowsRead / tally.totalExpected)) : 100;
		console.log(`summary-census ${percent}% rows=${tally.rowsRead}/${tally.totalExpected} accepted=${tally.accepted} rejected=${tally.rejected}`);
	}
	await closeShard(acceptedStream, acceptedShards);
	await closeShard(rejectedStream, rejectedShards);
	const after = await beforeCounts();
	await client.query('ROLLBACK');
	const unchanged = Object.keys(before).every((key) => before[key] === after[key]);
	const acceptedRootChecksum = `sha256:${acceptedHash.digest('hex')}`;
	const rejectedRootChecksum = `sha256:${rejectedHash.digest('hex')}`;
	const manifest = {
		schema: 'atlas.summary-search-census-manifest.v1', status: unchanged && tally.rowsRead === tally.accepted + tally.rejected && tally.rejected === 0 ? 'SEALED' : 'FAIL',
		mode: 'POSTGRES_READ_ONLY_SNAPSHOT', canonicalAuthority: false, repositoryId, workspaceRevision,
		selection: 'all non-empty codebase_chunk_index.summary rows; B-tree UUID keyset; no FTS-based identity selection',
		inputState: { before, after, unchanged }, shardSize, batchSize, tally,
		checks: { conservation: tally.rowsRead === tally.accepted + tally.rejected, schemaRejected: tally.rejected, zeroUnexpectedSchemaRejections: tally.rejected === 0, postgresReadOnly: true },
		acceptedShards, rejectedShards, acceptedBytes, rejectedBytes,
		acceptedRootChecksum, rejectedRootChecksum, sourceCohortChecksum: `sha256:${sourceCohortHash.digest('hex')}`,
		hintRepresentationArtifact: fs.existsSync(hintPath) ? path.relative(REPO_ROOT, hintPath).replaceAll('\\', '/') : null,
		writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 }, generatedAt: new Date().toISOString(),
	};
	fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
	const reportPath = path.join(REPO_ROOT, `docs/reports/summary-search-census-v1-${stamp}.json`);
	fs.writeFileSync(reportPath, `${JSON.stringify({ ...manifest, outputDir: path.relative(REPO_ROOT, outputRoot).replaceAll('\\', '/') }, null, 2)}\n`, { flag: 'wx' });
	console.log(JSON.stringify({ status: manifest.status, outputDir: path.relative(REPO_ROOT, outputRoot), reportPath: path.relative(REPO_ROOT, reportPath), tally, acceptedRootChecksum: manifest.acceptedRootChecksum, sourceCohortChecksum: manifest.sourceCohortChecksum, postgresReadOnly: unchanged }, null, 2));
} catch (error) {
	try { await client.query('ROLLBACK'); } catch { /* preserve original failure */ }
	throw error;
} finally {
	client.release();
	await pool.end();
}
