import type { PacketDigestBridgeV1 } from './packet-digest-bridge-v1.js';

export const CURRENT_PACKET_DIGEST_READBACK_SCHEMA_V1 = 'atlas.current-packet-digest-readback.v1' as const;

export type CurrentPacketDigestClassificationV1 =
	| 'CURRENT_EXACT'
	| 'PACKET_NOT_FOUND'
	| 'PACKET_IDENTITY_UNRESOLVED'
	| 'PACKET_IDENTITY_AMBIGUOUS'
	| 'PACKET_IDENTITY_MISMATCH'
	| 'PACKET_SOURCE_REF_MISMATCH'
	| 'SOURCE_REVISION_MISSING'
	| 'SOURCE_REVISION_MISMATCH'
	| 'WORKSPACE_REVISION_MISSING'
	| 'WORKSPACE_REVISION_MISMATCH'
	| 'PACKET_DIGEST_MISSING'
	| 'PACKET_DIGEST_AUTHORITY_UNPROVEN'
	| 'CONTENT_DIGEST_MISMATCH';

export type WholeSourceDigestEvidenceKindV1 =
	| 'SOURCE_CONTENT_DIGEST'
	| 'FILE_CONTENT_HASH'
	| 'LEGACY_SHA256'
	| 'AMBIGUOUS_CONTENT_HASH'
	| 'NONE';

/**
 * Narrow readback view of one exact atlas_packets candidate.
 *
 * `wholeSourceDigest` is intentionally separate from the raw legacy/hash
 * columns. The caller may populate it only when the producer contract proves
 * the value is a digest of the complete source bytes. Merely finding a
 * 64-character digest in `sha256`/`content_hash` must not promote it.
 */
export interface CurrentPacketDigestCandidateV1 {
	packetKey: string | null;
	sourceRef: string;
	sourceRevision: string | null;
	workspaceRevision: string | null;
	wholeSourceDigest: string | null;
	wholeSourceDigestKind: WholeSourceDigestEvidenceKindV1;
	legacySha256?: string | null;
	ambiguousContentHash?: string | null;
}

export interface CurrentPacketDigestReadbackV1 {
	schema: typeof CURRENT_PACKET_DIGEST_READBACK_SCHEMA_V1;
	classification: CurrentPacketDigestClassificationV1;
	packetKey: string | null;
	sourceRef: string;
	expectedSourceRevision: string;
	observedSourceRevision: string | null;
	expectedWorkspaceRevision: string;
	observedWorkspaceRevision: string | null;
	expectedContentDigest: string;
	observedWholeSourceDigest: string | null;
	wholeSourceDigestKind: WholeSourceDigestEvidenceKindV1;
	candidateCount: number;
	legacySha256Corroborates: boolean | null;
	ambiguousContentHashCorroborates: boolean | null;
	canonicalAuthority: false;
	writesPerformed: false;
}

const clean = (value: string | null | undefined): string | null => {
	if (value == null) return null;
	const trimmed = value.trim();
	return trimmed || null;
};

const normalizeDigest = (value: string | null | undefined): string | null => {
	const cleaned = clean(value)?.toLowerCase() ?? null;
	if (!cleaned) return null;
	const withoutPrefix = cleaned.replace(/^sha256:/, '');
	return /^[a-f0-9]{64}$/.test(withoutPrefix) ? withoutPrefix : null;
};

function result(
	bridge: PacketDigestBridgeV1,
	classification: CurrentPacketDigestClassificationV1,
	candidate: CurrentPacketDigestCandidateV1 | null,
	candidateCount: number,
): CurrentPacketDigestReadbackV1 {
	const legacySha256 = normalizeDigest(candidate?.legacySha256);
	const ambiguousContentHash = normalizeDigest(candidate?.ambiguousContentHash);
	return {
		schema: CURRENT_PACKET_DIGEST_READBACK_SCHEMA_V1,
		classification,
		packetKey: clean(candidate?.packetKey),
		sourceRef: candidate?.sourceRef ?? bridge.sourceRef,
		expectedSourceRevision: bridge.sourceRevision,
		observedSourceRevision: clean(candidate?.sourceRevision),
		expectedWorkspaceRevision: bridge.workspaceRevision,
		observedWorkspaceRevision: clean(candidate?.workspaceRevision),
		expectedContentDigest: bridge.contentDigest,
		observedWholeSourceDigest: normalizeDigest(candidate?.wholeSourceDigest),
		wholeSourceDigestKind: candidate?.wholeSourceDigestKind ?? 'NONE',
		candidateCount,
		legacySha256Corroborates: legacySha256 == null ? null : legacySha256 === bridge.contentDigest,
		ambiguousContentHashCorroborates: ambiguousContentHash == null ? null : ambiguousContentHash === bridge.contentDigest,
		canonicalAuthority: false,
		writesPerformed: false,
	};
}

/**
 * Fail-closed current packet digest readback classifier.
 *
 * The function does not resolve packet identity and does not infer a digest
 * authority from column names. Callers must already have an admitted
 * PacketDigestBridgeV1 and exact atlas_packets candidates for its sourceRef.
 */
export function classifyCurrentPacketDigestReadbackV1(
	bridge: PacketDigestBridgeV1,
	candidates: CurrentPacketDigestCandidateV1[],
): CurrentPacketDigestReadbackV1 {
	if (candidates.length === 0) return result(bridge, 'PACKET_NOT_FOUND', null, 0);

	const packetKeys = [...new Set(candidates.map((row) => clean(row.packetKey)).filter((value): value is string => value !== null))];
	if (packetKeys.length === 0) return result(bridge, 'PACKET_IDENTITY_UNRESOLVED', candidates[0] ?? null, candidates.length);
	if (packetKeys.length > 1) return result(bridge, 'PACKET_IDENTITY_AMBIGUOUS', candidates[0] ?? null, candidates.length);
	if (packetKeys[0] !== bridge.packetKey) return result(bridge, 'PACKET_IDENTITY_MISMATCH', candidates[0] ?? null, candidates.length);

	const exactKeyCandidates = candidates.filter((row) => clean(row.packetKey) === bridge.packetKey);
	if (exactKeyCandidates.length !== 1) return result(bridge, 'PACKET_IDENTITY_AMBIGUOUS', exactKeyCandidates[0] ?? candidates[0] ?? null, candidates.length);
	const candidate = exactKeyCandidates[0];

	if (candidate.sourceRef !== bridge.sourceRef) return result(bridge, 'PACKET_SOURCE_REF_MISMATCH', candidate, candidates.length);

	const sourceRevision = clean(candidate.sourceRevision);
	if (!sourceRevision) return result(bridge, 'SOURCE_REVISION_MISSING', candidate, candidates.length);
	if (sourceRevision !== bridge.sourceRevision) return result(bridge, 'SOURCE_REVISION_MISMATCH', candidate, candidates.length);

	const workspaceRevision = clean(candidate.workspaceRevision);
	if (!workspaceRevision) return result(bridge, 'WORKSPACE_REVISION_MISSING', candidate, candidates.length);
	if (workspaceRevision !== bridge.workspaceRevision) return result(bridge, 'WORKSPACE_REVISION_MISMATCH', candidate, candidates.length);

	const wholeSourceDigest = normalizeDigest(candidate.wholeSourceDigest);
	if (!wholeSourceDigest) {
		const hasAnyDigestEvidence = normalizeDigest(candidate.legacySha256) !== null
			|| normalizeDigest(candidate.ambiguousContentHash) !== null;
		return result(
			bridge,
			hasAnyDigestEvidence ? 'PACKET_DIGEST_AUTHORITY_UNPROVEN' : 'PACKET_DIGEST_MISSING',
			candidate,
			candidates.length,
		);
	}

	if (candidate.wholeSourceDigestKind !== 'SOURCE_CONTENT_DIGEST'
		&& candidate.wholeSourceDigestKind !== 'FILE_CONTENT_HASH') {
		return result(bridge, 'PACKET_DIGEST_AUTHORITY_UNPROVEN', candidate, candidates.length);
	}
	if (wholeSourceDigest !== bridge.contentDigest) return result(bridge, 'CONTENT_DIGEST_MISMATCH', candidate, candidates.length);

	return result(bridge, 'CURRENT_EXACT', candidate, candidates.length);
}
