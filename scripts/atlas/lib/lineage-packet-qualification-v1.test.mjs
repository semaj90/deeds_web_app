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
	assert.match(metric, /lower\(packet_workspace_revision\) = workspace_revision/);
	assert.match(metric, /packet_lineage_binding_checksum IS NOT NULL/);
	assert.match(metric, /packet_lineage_producer_revision IS NOT NULL/);
	assert.doesNotMatch(metric, /packet_content_hash/);
});
