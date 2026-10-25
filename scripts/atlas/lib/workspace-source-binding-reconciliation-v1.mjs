import { createHash } from 'node:crypto';

const normalizeDigest = (value) => String(value ?? '').trim().toLowerCase().replace(/^sha256:/, '');
const hashJson = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;

const bindingChecksum = (row) => createHash('sha256')
	.update(`${row.repoId}:${row.workspaceRevision}:${row.sourceRef}:${row.sourceRevision}:${row.contentDigest}:${row.byteLength}:${row.producerRevision}`, 'utf8')
	.digest('hex');

const bindingEquals = (actual, expected) => actual
	&& actual.canonical_source_ref === expected.sourceRef
	&& actual.source_revision === expected.sourceRevision
	&& normalizeDigest(actual.content_digest) === normalizeDigest(expected.contentDigest)
	&& Number(actual.byte_length) === expected.byteLength
	&& Number(actual.source_manifest_ordinal) === expected.sourceManifestOrdinal
	&& actual.producer_revision === expected.producerRevision
	&& actual.binding_checksum === expected.bindingChecksum;

export function planWorkspaceSourceBindingsV1({
	snapshotSources,
	graphRows,
	registryRows,
	existingBindings,
	repoId,
	workspaceRevision,
	producerRevision,
}) {
	if (!Array.isArray(snapshotSources) || !Array.isArray(graphRows) || !Array.isArray(registryRows) || !Array.isArray(existingBindings)) {
		throw new Error('WORKSPACE_SOURCE_BINDING_INPUTS_INVALID');
	}
	if (!repoId || !/^sha256:[0-9a-f]{64}$/i.test(workspaceRevision ?? '') || !producerRevision) {
		throw new Error('WORKSPACE_SOURCE_BINDING_IDENTITY_INVALID');
	}

	const group = (rows, keyOf) => {
		const map = new Map();
		for (const row of rows) {
			const key = String(keyOf(row) ?? '');
			if (!key) continue;
			const values = map.get(key) ?? [];
			values.push(row);
			map.set(key, values);
		}
		return map;
	};
	const graphByRef = group(graphRows, (row) => row.source_ref);
	const registryByRef = group(registryRows, (row) => row.source_ref_key);
	const bindingsByRef = group(existingBindings, (row) => row.canonical_source_ref);
	const counts = {
		notInGraph: 0,
		duplicateGraphRows: 0,
		contentMismatch: 0,
		byteLengthMismatch: 0,
		notInRegistry: 0,
		duplicateRegistryRows: 0,
		sourceTypeMismatch: 0,
		registryContentMismatch: 0,
		sourceRevisionMismatch: 0,
		alreadyBound: 0,
		bindingConflict: 0,
		duplicateExistingBindings: 0,
		candidateBindings: 0,
	};
	const qualified = [];
	const rootSources = snapshotSources
		.map((source, manifestOrdinal) => ({ source, manifestOrdinal }))
		.filter(({ source }) => source.repositoryId === 'repo:root')
		.sort((a, b) => String(a.source.sourceRef).localeCompare(String(b.source.sourceRef)));

	for (const { source, manifestOrdinal } of rootSources) {
		const sourceRef = String(source.sourceRef ?? '');
		const graphMatches = graphByRef.get(sourceRef) ?? [];
		if (graphMatches.length === 0) {
			counts.notInGraph += 1;
			continue;
		}
		if (graphMatches.length !== 1) {
			counts.duplicateGraphRows += 1;
			continue;
		}
		const graph = graphMatches[0];
		if (normalizeDigest(graph.content_hash) !== normalizeDigest(source.contentDigest)) {
			counts.contentMismatch += 1;
			continue;
		}
		if (Number(graph.byte_length) !== Number(source.byteLength)) {
			counts.byteLengthMismatch += 1;
			continue;
		}
		const registryMatches = registryByRef.get(sourceRef) ?? [];
		if (registryMatches.length === 0) {
			counts.notInRegistry += 1;
			continue;
		}
		if (registryMatches.length !== 1) {
			counts.duplicateRegistryRows += 1;
			continue;
		}
		const registry = registryMatches[0];
		if (registry.source_type !== 'code') {
			counts.sourceTypeMismatch += 1;
			continue;
		}
		if (normalizeDigest(registry.content_hash) !== normalizeDigest(source.contentDigest)) {
			counts.registryContentMismatch += 1;
			continue;
		}
		if (normalizeDigest(source.sourceRevision) !== normalizeDigest(source.contentDigest)) {
			counts.sourceRevisionMismatch += 1;
			continue;
		}
		qualified.push({ source, sourceRef, manifestOrdinal, graph });
	}

	const bindingRows = qualified.map(({ source, sourceRef, manifestOrdinal, graph }) => {
		const row = {
			repoId,
			workspaceRevision,
			sourceRef,
			sourceRevision: source.sourceRevision,
			contentDigest: normalizeDigest(source.contentDigest),
			byteLength: Number(graph.byte_length),
			sourceManifestOrdinal: manifestOrdinal,
			producerRevision,
		};
		return { ...row, bindingChecksum: bindingChecksum(row) };
	});

	const candidates = [];
	for (const expected of bindingRows) {
		const actualRows = bindingsByRef.get(expected.sourceRef) ?? [];
		if (actualRows.length > 1) {
			counts.duplicateExistingBindings += 1;
			continue;
		}
		if (actualRows.length === 1) {
			if (bindingEquals(actualRows[0], expected)) counts.alreadyBound += 1;
			else counts.bindingConflict += 1;
			continue;
		}
		candidates.push(expected);
	}
	counts.candidateBindings = candidates.length;
	return {
		rows: candidates,
		counts,
		candidateBindingSetSha256: hashJson(candidates),
		canonicalAuthority: false,
		writesPerformed: false,
	};
}

export function verifyWorkspaceSourceBindingReadbackV1(expectedRows, actualRows) {
	if (!Array.isArray(expectedRows) || !Array.isArray(actualRows)) throw new Error('WORKSPACE_SOURCE_BINDING_READBACK_INVALID');
	const actualByRef = groupRows(actualRows, (row) => row.canonical_source_ref);
	const mismatches = [];
	for (const expected of expectedRows) {
		const matches = actualByRef.get(expected.sourceRef) ?? [];
		if (matches.length !== 1 || !bindingEquals(matches[0], expected)) mismatches.push(expected.sourceRef);
	}
	if (actualRows.length !== expectedRows.length || mismatches.length > 0) {
		throw new Error(`WORKSPACE_SOURCE_BINDING_READBACK_MISMATCH:${mismatches.length}`);
	}
	return { verifiedCount: expectedRows.length, mismatches: [] };
}

function groupRows(rows, keyOf) {
	const map = new Map();
	for (const row of rows) {
		const key = String(keyOf(row) ?? '');
		if (!key) continue;
		const values = map.get(key) ?? [];
		values.push(row);
		map.set(key, values);
	}
	return map;
}
