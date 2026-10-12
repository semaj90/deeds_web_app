import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyOntologyTupleSourceReadbackV1 } from './ontology-tuple-source-readback-v1.mts';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('reopened matching source and span remain explicitly not admitted', async () => {
	const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'atlas-tuple-source-'));
	try {
		await mkdir(path.join(repoRoot, 'src'));
		const sourceBytes = Buffer.from('const relation = "ACE uses Valkey";\n', 'utf8');
		await writeFile(path.join(repoRoot, 'src', 'relation.ts'), sourceBytes);
		const start = sourceBytes.indexOf(Buffer.from('ACE uses Valkey', 'utf8'));
		const end = start + Buffer.byteLength('ACE uses Valkey', 'utf8');
		const sourceRevision = `sha256:${sha256(sourceBytes)}`;
		const workspaceRevision = `sha256:${'b'.repeat(64)}`;
		const spanChecksum = `sha256:${sha256(sourceBytes.subarray(start, end))}`;
		const sourceRef = 'src/relation.ts';
		const tuple = {
			tuple_id: 'tuple:fixture', schema_version: 'ontology-linked-tuple.v1', packet_key: 'packet:fixture', source_ref: sourceRef,
			evidence_span: { sourceRef, start, end }, evidence_state: 'ACTIVE_VERIFIED',
			surface_text: 'ACE uses Valkey', label: 'USES', label_kind: 'ontology', label_source: 'manual',
			ontology_ids: [], concept_ids: [], confidence: 1, lifecycle: 'OBSERVED',
			participants: [
				{ entityId: 'ACE', entityKind: 'ast_symbol', role: 'actor' },
				{ entityId: 'Valkey', entityKind: 'ast_symbol', role: 'target' },
			], evidence_refs: ['task:fixture'],
			provenance: {
				sourceRevision, workspaceRevision, taskRevision: `sha256:${'c'.repeat(64)}`,
				evidenceCardChecksum: `sha256:${'d'.repeat(64)}`, evidenceSpanChecksum: spanChecksum,
			},
		};
		const result = await verifyOntologyTupleSourceReadbackV1({
			tuple,
			packetRows: [{
				packet_key: tuple.packet_key, source_ref: sourceRef, source_revision: sourceRevision,
				workspace_revision_key: workspaceRevision,
			}],
			sourceBindingRows: [{
				repo_id: 'repo:fixture', workspace_revision: workspaceRevision,
				canonical_source_ref: sourceRef, source_revision: sourceRevision,
				content_digest: sourceRevision.slice('sha256:'.length), binding_checksum: `sha256:${'e'.repeat(64)}`,
				byte_length: sourceBytes.byteLength, producer_revision: 'fixture:source-binding',
			}],
			repoRoot,
			expectedEvidenceRef: 'task:fixture',
		});
		assert.equal(result.status, 'SOURCE_BYTES_AND_SPAN_MATCH_NOT_ADMITTED');
		assert.equal(result.tupleRecord?.tupleId, tuple.tuple_id);
		assert.equal(result.tupleRecord?.schemaVersion, tuple.schema_version);
		assert.equal(result.canonicalAuthority, false);
		assert.equal(result.admitted, false);
	} finally {
		await rm(repoRoot, { recursive: true, force: true });
	}
});

test('missing tuple input fails closed before filesystem access', async () => {
	const result = await verifyOntologyTupleSourceReadbackV1({
		tuple: null as never,
		packetRows: [],
		sourceBindingRows: [],
		repoRoot: '.',
		expectedEvidenceRef: 'task:example',
	});
	assert.equal(result.status, 'BLOCKED');
	assert.equal(result.reason, 'TUPLE_SOURCE_BINDING_INPUT_INVALID');
});
