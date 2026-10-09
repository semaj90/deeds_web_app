import { createHash } from 'node:crypto';

export const CHUNK_LINEAGE_MIRROR_FIELDS_V2 = Object.freeze([
	'workspace_revision',
	'source_revision',
	'lineage_binding_checksum',
	'lineage_producer_revision',
]);

export const CHUNK_LINEAGE_MIRROR_ASSIGNMENTS_V2 = Object.freeze([
	'workspace_revision = s.workspace_revision',
	'source_revision = s.source_revision',
	'lineage_binding_checksum = s.binding_checksum',
	'lineage_producer_revision = s.producer_revision',
]);

export function parseChunkLineageMirrorArgsV2(argv) {
	const values = new Map(argv.filter((arg) => arg.startsWith('--') && arg.includes('='))
		.map((arg) => {
			const index = arg.indexOf('=');
			return [arg.slice(2, index), arg.slice(index + 1)];
		}));
	const flags = new Set(argv.filter((arg) => arg.startsWith('--') && !arg.includes('=')));
	const required = (name) => {
		const value = values.get(name)?.trim();
		if (!value) throw new Error(`REQUIRED_ARGUMENT_MISSING: --${name}`);
		return value;
	};
	const repoId = required('repo-id');
	const workspaceRevision = required('workspace-revision');
	const limit = Number.parseInt(required('limit'), 10);
	const admissionReceipt = required('admission-receipt');
	const apply = flags.has('--apply');
	if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('INVALID_LIMIT: expected 1..5000');
	if (apply && limit !== 5000) throw new Error('APPLY_REQUIRES_FROZEN_5000_ROW_CANARY');
	if (apply && required('expected-count') !== String(limit)) throw new Error('EXPECTED_COUNT_MUST_EQUAL_FROZEN_CANARY_LIMIT');
	if (apply && !/^sha256:[a-f0-9]{64}$/.test(required('expected-checksum'))) throw new Error('EXPECTED_CHECKSUM_MUST_BE_SHA256');
	if (apply && required('authorization') !== 'CHUNK-LINEAGE-APPLY-01:COMMIT') throw new Error('EXPLICIT_APPLY_AUTHORIZATION_REQUIRED');
	return { values, flags, repoId, workspaceRevision, limit, admissionReceipt, apply };
}

export function normalizeCanonicalSourceRefV1(value) {
	return String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

export function classifyChunkLineageMirrorCandidateV2(candidate) {
	if (candidate.pathBindingCount !== 1) return 'NORMALIZED_SOURCE_BINDING_AMBIGUOUS';
	if (!candidate.pathExact) return 'CASE_INSENSITIVE_SOURCE_REF_ONLY';
	if (!candidate.digestExact) return 'WHOLE_FILE_DIGEST_MISMATCH';
	if (candidate.representationRevision != null) return 'REPRESENTATION_REVISION_PREEXISTING_NON_NULL';
	if (candidate.bridgeSourceRevisions?.some((revision) => revision !== candidate.bindingSourceRevision)) {
		return 'BRIDGE_BINDING_SOURCE_REVISION_CONFLICT';
	}
	if (candidate.chunkSourceRevision != null && candidate.chunkSourceRevision !== candidate.bindingSourceRevision) {
		return 'CHUNK_BINDING_SOURCE_REVISION_CONFLICT';
	}
	if (candidate.chunkWorkspaceRevision != null && candidate.chunkWorkspaceRevision !== candidate.bindingWorkspaceRevision) {
		return 'CHUNK_BINDING_WORKSPACE_REVISION_CONFLICT';
	}
	if (candidate.chunkBindingChecksum != null && candidate.chunkBindingChecksum !== candidate.bindingChecksum) {
		return 'CHUNK_BINDING_CHECKSUM_CONFLICT';
	}
	if (candidate.chunkProducerRevision != null && candidate.chunkProducerRevision !== candidate.bindingProducerRevision) {
		return 'CHUNK_BINDING_PRODUCER_REVISION_CONFLICT';
	}
	return 'ELIGIBLE';
}

export function chunkLineageCandidateChecksumV2(candidates) {
	const canonical = [...candidates]
		.sort((left, right) => String(left.id).localeCompare(String(right.id)))
		.map((candidate) => ({
			id: String(candidate.id),
			sourceRef: candidate.sourceRef,
			fileContentHash: candidate.fileContentHash,
			bindingSourceRef: candidate.bindingSourceRef,
			bindingSourceRevision: candidate.bindingSourceRevision,
			bindingWorkspaceRevision: candidate.bindingWorkspaceRevision,
			bindingChecksum: candidate.bindingChecksum,
			bindingProducerRevision: candidate.bindingProducerRevision,
			bridgeSourceRevisions: [...(candidate.bridgeSourceRevisions ?? [])].sort(),
			pathBindingCount: candidate.pathBindingCount,
			pathExact: candidate.pathExact,
			digestExact: candidate.digestExact,
			chunkSourceRevision: candidate.chunkSourceRevision,
			chunkWorkspaceRevision: candidate.chunkWorkspaceRevision,
			chunkBindingChecksum: candidate.chunkBindingChecksum,
			chunkProducerRevision: candidate.chunkProducerRevision,
			representationRevision: candidate.representationRevision,
		}));
	return `sha256:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`;
}

export function canonicalSourceRefSqlV1(expression) {
	return `regexp_replace(regexp_replace(replace(btrim(${expression}), E'\\\\', '/'), '^\\./', ''), '^/+', '')`;
}

export function digestSqlV1(expression) {
	return `regexp_replace(lower(btrim(${expression})), '^sha256:', '')`;
}
