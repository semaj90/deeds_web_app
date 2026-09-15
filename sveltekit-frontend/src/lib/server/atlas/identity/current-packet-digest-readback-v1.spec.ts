import { describe, expect, it } from 'vitest';
import { buildPacketDigestBridgeV1 } from './packet-digest-bridge-v1.js';
import { classifyCurrentPacketDigestReadbackV1 } from './current-packet-digest-readback-v1.js';

const admission = {
	status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' as const,
	authority: true as const,
	workspaceRevision: 'sha256:' + 'a'.repeat(64),
};

const bridge = buildPacketDigestBridgeV1({
	packetKey: 'packet:canonical:example',
	sourceRef: 'src/lib/example.ts',
	sourceContent: 'export const value = 1;\n',
	admission,
});

const exactCandidate = {
	packetKey: bridge.packetKey,
	sourceRef: bridge.sourceRef,
	sourceRevision: bridge.sourceRevision,
	workspaceRevision: bridge.workspaceRevision,
	wholeSourceDigest: bridge.contentDigest,
	wholeSourceDigestKind: 'SOURCE_CONTENT_DIGEST' as const,
	legacySha256: bridge.contentDigest,
	ambiguousContentHash: bridge.contentDigest,
};

describe('CurrentPacketDigestReadbackV1', () => {
	it('classifies one fully qualified current row as CURRENT_EXACT', () => {
		const result = classifyCurrentPacketDigestReadbackV1(bridge, [exactCandidate]);
		expect(result.classification).toBe('CURRENT_EXACT');
		expect(result.legacySha256Corroborates).toBe(true);
		expect(result.ambiguousContentHashCorroborates).toBe(true);
		expect(result.canonicalAuthority).toBe(false);
		expect(result.writesPerformed).toBe(false);
	});

	it('distinguishes missing packets from unresolved identity', () => {
		expect(classifyCurrentPacketDigestReadbackV1(bridge, []).classification).toBe('PACKET_NOT_FOUND');
		expect(classifyCurrentPacketDigestReadbackV1(bridge, [{ ...exactCandidate, packetKey: null }]).classification)
			.toBe('PACKET_IDENTITY_UNRESOLVED');
	});

	it('fails closed when multiple packet keys exist for one source candidate set', () => {
		const result = classifyCurrentPacketDigestReadbackV1(bridge, [
			exactCandidate,
			{ ...exactCandidate, packetKey: 'packet:other' },
		]);
		expect(result.classification).toBe('PACKET_IDENTITY_AMBIGUOUS');
	});

	it('separates source revision and workspace revision failures', () => {
		expect(classifyCurrentPacketDigestReadbackV1(bridge, [{ ...exactCandidate, sourceRevision: null }]).classification)
			.toBe('SOURCE_REVISION_MISSING');
		expect(classifyCurrentPacketDigestReadbackV1(bridge, [{ ...exactCandidate, sourceRevision: 'sha256:' + 'b'.repeat(64) }]).classification)
			.toBe('SOURCE_REVISION_MISMATCH');
		expect(classifyCurrentPacketDigestReadbackV1(bridge, [{ ...exactCandidate, workspaceRevision: null }]).classification)
			.toBe('WORKSPACE_REVISION_MISSING');
		expect(classifyCurrentPacketDigestReadbackV1(bridge, [{ ...exactCandidate, workspaceRevision: 'sha256:' + 'c'.repeat(64) }]).classification)
			.toBe('WORKSPACE_REVISION_MISMATCH');
	});

	it('does not promote legacy sha256 or ambiguous content_hash as whole-source authority', () => {
		const result = classifyCurrentPacketDigestReadbackV1(bridge, [{
			...exactCandidate,
			wholeSourceDigest: null,
			wholeSourceDigestKind: 'NONE' as const,
			legacySha256: bridge.contentDigest,
			ambiguousContentHash: bridge.contentDigest,
		}]);
		expect(result.classification).toBe('PACKET_DIGEST_AUTHORITY_UNPROVEN');
		expect(result.legacySha256Corroborates).toBe(true);
		expect(result.ambiguousContentHashCorroborates).toBe(true);
	});

	it('rejects a wrong whole-source digest even when identity and revisions match', () => {
		const result = classifyCurrentPacketDigestReadbackV1(bridge, [{
			...exactCandidate,
			wholeSourceDigest: 'd'.repeat(64),
		}]);
		expect(result.classification).toBe('CONTENT_DIGEST_MISMATCH');
	});
});
