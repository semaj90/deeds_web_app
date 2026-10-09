import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { currentRevisionQualifiedPacketCountV1 } from './lineage-packet-qualification-v1.mjs';

test('uses the unique exact source-revision/workspace-binding count', () => {
	assert.equal(currentRevisionQualifiedPacketCountV1({
		packet_revision_workspace_binding_matches: 16151,
		packet_revision_matches: 16151,
		packet_full_identity_matches: 0,
	}), 16151);
});

test('does not promote source-revision-only matches without workspace/provenance qualification', () => {
	assert.equal(currentRevisionQualifiedPacketCountV1({
		packet_revision_matches: 16151,
		packet_full_identity_matches: 0,
	}), 0);
});

test('legacy content-hash matches cannot qualify or disqualify a packet', () => {
	assert.equal(currentRevisionQualifiedPacketCountV1({
		packet_revision_workspace_binding_matches: 7,
		packet_full_identity_matches: 0,
	}), 7);
	assert.equal(currentRevisionQualifiedPacketCountV1({
		packet_revision_workspace_binding_matches: 0,
		packet_full_identity_matches: 7,
	}), 0);
});

test('malformed or negative audit counts fail closed', () => {
	for (const value of [undefined, null, '7', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
		assert.equal(currentRevisionQualifiedPacketCountV1({
			packet_revision_workspace_binding_matches: value,
		}), 0);
	}
});

test('SQL qualification requires one packet key, exact workspace revision, and binding provenance', () => {
	const auditSql = fs.readFileSync(new URL('../audit-current-workspace-packet-chunk-join-v1.mjs', import.meta.url), 'utf8');
	const start = auditSql.indexOf('AS packet_revision_workspace_binding_matches');
	assert.notEqual(start, -1);
	const metric = auditSql.slice(auditSql.lastIndexOf('(SELECT count(*) FROM (', start), start);
	assert.match(metric, /count\(DISTINCT packet_key\) = 1/);
	assert.match(metric, /count\(DISTINCT source_revision\) = 1/);
	assert.match(metric, /lower\(packet_source_revision\) = source_revision/);
	assert.match(metric, /packet_lineage_binding_checksum IS NOT NULL/);
	assert.match(metric, /packet_lineage_producer_revision IS NOT NULL/);
	assert.doesNotMatch(metric, /packet_content_hash/);
	assert.match(auditSql, /workspace_revision::text AS workspace_revision[\s\S]*?FROM public\.atlas_workspace_source_bindings/);
	assert.doesNotMatch(auditSql, /p\.workspace_revision_key|packet_workspace_revision/);
	const packetCandidates = auditSql.slice(auditSql.indexOf('), packet_candidates AS ('), auditSql.indexOf('), proven_lineage AS ('));
	assert.match(packetCandidates, /g\.workspace_revision/);
	assert.match(packetCandidates, /FROM graphify_exact g[\s\S]*?LEFT JOIN public\.atlas_packets p/);
});

test('bounded identity classification batches packet and lineage lookups without per-row lateral scans', () => {
	const auditSql = fs.readFileSync(new URL('../audit-current-workspace-packet-chunk-join-v1.mjs', import.meta.url), 'utf8');
	const start = auditSql.indexOf('const identityRows = await client.query(`');
	const end = auditSql.indexOf('identityClassifications = identityRows.rows.map', start);
	assert.notEqual(start, -1);
	assert.notEqual(end, -1);
	const query = auditSql.slice(start, end);
	assert.match(query, /selected AS MATERIALIZED/);
	assert.match(query, /packet_data AS MATERIALIZED/);
	assert.match(query, /lineage_data AS MATERIALIZED/);
	assert.match(query, /revision_status = 'PROVEN'/);
	assert.match(query, /lower\(l\.source_revision::text\) = s\.source_revision/);
	assert.doesNotMatch(query, /JOIN LATERAL|LEFT JOIN LATERAL/);
});

test('packet history diagnostics are bounded to selected exact packet keys and retain revision status', () => {
	const auditSql = fs.readFileSync(new URL('../audit-current-workspace-packet-chunk-join-v1.mjs', import.meta.url), 'utf8');
	const start = auditSql.indexOf('const identityRows = await client.query(`');
	const end = auditSql.indexOf('identityClassifications = identityRows.rows.map', start);
	const query = auditSql.slice(start, end);
	assert.match(query, /packet_keys AS MATERIALIZED/);
	assert.match(query, /FROM selected s[\s\S]*?JOIN public\.atlas_packets p/);
	assert.match(query, /JOIN public\.atlas_packet_chunk_lineage l ON l\.packet_key::text = pk\.packet_key/);
	assert.match(query, /'revision_status', l\.revision_status/);
	assert.match(query, /'lineage_source_ref'/);
	assert.match(query, /COALESCE\(packet_lineage_data\.packet_lineage_rows, '\[\]'::jsonb\) AS packet_lineage_rows/);
});

test('physical source-ref chunk observations stay revision-unqualified diagnostics, not lineage joins', () => {
	const auditSql = fs.readFileSync(new URL('../audit-current-workspace-packet-chunk-join-v1.mjs', import.meta.url), 'utf8');
	const start = auditSql.indexOf('const identityRows = await client.query(`');
	const end = auditSql.indexOf('identityClassifications = identityRows.rows.map', start);
	const query = auditSql.slice(start, end);
	assert.match(query, /source_chunk_diagnostic AS MATERIALIZED/);
	assert.match(query, /c\.source_ref::text = s\.source_ref/);
	assert.match(query, /'revisionQualified', false/);
	assert.match(query, /CODEBASE_CHUNK_INDEX_SOURCE_REVISION_COLUMN_UNAVAILABLE/);
	assert.doesNotMatch(query, /c\.code_source_revision|c\.source_revision/);
	assert.doesNotMatch(query, /source_chunk_diagnostic[\s\S]*?JOIN public\.atlas_packet_chunk_lineage/);
});

test('aggregate exact packet-chunk lineage requires the same qualified unique packet key', () => {
	const auditSql = fs.readFileSync(new URL('../audit-current-workspace-packet-chunk-join-v1.mjs', import.meta.url), 'utf8');
	const end = auditSql.indexOf('const identityRows = await client.query(`');
	const aggregateQuery = auditSql.slice(auditSql.indexOf('const result = await client.query(`'), end);
	assert.match(aggregateQuery, /source_revision_lineage AS/);
	assert.match(aggregateQuery, /qualified_packet_bindings AS/);
	assert.match(aggregateQuery, /packet_key_count = 1/);
	assert.match(aggregateQuery, /packet_lineage_binding_checksum IS NOT NULL/);
	assert.match(aggregateQuery, /qp\.packet_key = sl\.packet_key::text/);
	assert.match(aggregateQuery, /FROM source_revision_lineage\)::integer AS binding_proven_lineage_sources/);
	assert.match(aggregateQuery, /FROM proven_lineage\)::integer AS packet_chunk_exact_sources/);
});

test('canonical key wins; exact source_revision qualifies even when the legacy content hash differs', () => {
	assert.equal(currentRevisionQualifiedPacketCountV1({
		packet_full_canonical_identity_matches: 9,
		packet_legacy_content_hash_matches: 0,
		packet_revision_workspace_binding_matches: 9,
	}), 9);
});

test('legacy content_hash matches alone can never qualify a packet', () => {
	assert.equal(currentRevisionQualifiedPacketCountV1({
		packet_full_canonical_identity_matches: 0,
		packet_legacy_content_hash_matches: 500,
		packet_full_identity_matches: 500,
	}), 0);
});

test('missing or malformed canonical count fails closed instead of falling back to a legacy hash count', () => {
	assert.equal(currentRevisionQualifiedPacketCountV1({ packet_full_canonical_identity_matches: '9', packet_revision_workspace_binding_matches: 9 }), 0);
	assert.equal(currentRevisionQualifiedPacketCountV1({ packet_legacy_content_hash_matches: 9 }), 0);
});

test('SQL separates the four packet metrics; only revision, workspace, and provenance decide canonical identity', () => {
	const sql = fs.readFileSync(new URL('../audit-current-workspace-packet-chunk-join-v1.mjs', import.meta.url), 'utf8');
	const metricOf = (name) => {
		const end = sql.indexOf(`AS ${name}`);
		assert.notEqual(end, -1, name);
		return sql.slice(sql.lastIndexOf('(SELECT count(', end), end);
	};
	const revision = metricOf('packet_revision_identity_matches');
	assert.match(revision, /lower\(packet_source_revision\) = source_revision/);
	assert.doesNotMatch(revision, /packet_content_hash|packet_workspace_revision/);
	const binding = metricOf('packet_workspace_binding_matches');
	assert.match(binding, /packet_lineage_binding_checksum IS NOT NULL/);
	assert.match(binding, /packet_lineage_producer_revision IS NOT NULL/);
	assert.doesNotMatch(binding, /packet_content_hash/);
	const legacy = metricOf('packet_legacy_content_hash_matches');
	assert.match(legacy, /packet_content_hash/);
	assert.doesNotMatch(legacy, /packet_source_revision|workspace_revision/);
	const canonical = metricOf('packet_full_canonical_identity_matches');
	assert.match(canonical, /lower\(packet_source_revision\) = source_revision/);
	assert.match(canonical, /count\(DISTINCT packet_key\) = 1/);
	assert.doesNotMatch(canonical, /packet_workspace_revision/);
	assert.doesNotMatch(canonical, /packet_content_hash/);
});
