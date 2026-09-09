import { describe, expect, it } from 'vitest';
import {
	decidePacketWrite,
	type CanonicalPacketStateV1,
	type PacketWriteRequestV1,
} from './packet-write-decision-v1.js';

const absentRow: CanonicalPacketStateV1 = {
	exists: false,
	packetKey: 'packet:abc',
	sourceRef: null,
	sourceRevision: null,
	workspaceRevision: null,
	contentDigest: null,
};

function existingRow(overrides: Partial<CanonicalPacketStateV1> = {}): CanonicalPacketStateV1 {
	return {
		exists: true,
		packetKey: 'packet:abc',
		sourceRef: 'src/lib/server/example.ts',
		sourceRevision: 'sha256:rev-1',
		workspaceRevision: 'sha256:ws-1',
		contentDigest: 'sha256:content-1',
		...overrides,
	};
}

function baseRequest(overrides: Partial<PacketWriteRequestV1> = {}): PacketWriteRequestV1 {
	return {
		packetKey: 'packet:abc',
		sourceRef: 'src/lib/server/example.ts',
		sourceRevision: 'sha256:rev-1',
		workspaceRevision: 'sha256:ws-1',
		contentDigest: 'sha256:content-1',
		...overrides,
	};
}

describe('decidePacketWrite', () => {
	it('returns INSERT_NEW when no canonical row exists yet', () => {
		const result = decidePacketWrite(absentRow, baseRequest());
		expect(result.decision).toBe('INSERT_NEW');
	});

	it('returns IDENTITY_CONFLICT when sourceRef differs for the same packetKey', () => {
		const current = existingRow({ sourceRef: 'src/lib/server/example.ts' });
		const request = baseRequest({ sourceRef: 'src/lib/server/different.ts' });
		const result = decidePacketWrite(current, request);
		expect(result.decision).toBe('IDENTITY_CONFLICT');
	});

	it('returns REVISION_UNPROVEN when the request supplies no sourceRevision at all', () => {
		const current = existingRow();
		const request = baseRequest({ sourceRevision: null });
		const result = decidePacketWrite(current, request);
		expect(result.decision).toBe('REVISION_UNPROVEN');
	});

	it('returns IDEMPOTENT_REPLAY when sourceRevision, content, and workspaceRevision all match', () => {
		const current = existingRow();
		const request = baseRequest();
		const result = decidePacketWrite(current, request);
		expect(result.decision).toBe('IDEMPOTENT_REPLAY');
	});

	it('returns CONTENT_CONFLICT when sourceRevision matches but contentDigest differs', () => {
		const current = existingRow({ contentDigest: 'sha256:content-1' });
		const request = baseRequest({ contentDigest: 'sha256:content-DIFFERENT' });
		const result = decidePacketWrite(current, request);
		expect(result.decision).toBe('CONTENT_CONFLICT');
	});

	it('returns WORKSPACE_REVISION_CONFLICT when sourceRevision/content match but workspaceRevision differs', () => {
		const current = existingRow({ workspaceRevision: 'sha256:ws-1' });
		const request = baseRequest({ workspaceRevision: 'sha256:ws-DIFFERENT' });
		const result = decidePacketWrite(current, request);
		expect(result.decision).toBe('WORKSPACE_REVISION_CONFLICT');
	});

	it('returns REVISION_UNPROVEN when sourceRevision differs and no expectedCurrentSourceRevision was supplied', () => {
		const current = existingRow({ sourceRevision: 'sha256:rev-1' });
		const request = baseRequest({ sourceRevision: 'sha256:rev-2' });
		const result = decidePacketWrite(current, request);
		expect(result.decision).toBe('REVISION_UNPROVEN');
	});

	it('returns SOURCE_REVISION_CONFLICT when expectedCurrentSourceRevision does not match actual current (stale read)', () => {
		const current = existingRow({ sourceRevision: 'sha256:rev-1' });
		const request = baseRequest({
			sourceRevision: 'sha256:rev-2',
			expectedCurrentSourceRevision: 'sha256:rev-STALE',
		});
		const result = decidePacketWrite(current, request);
		expect(result.decision).toBe('SOURCE_REVISION_CONFLICT');
	});

	it('returns ADVANCE_SOURCE_REVISION when expectedCurrentSourceRevision correctly matches actual current', () => {
		const current = existingRow({ sourceRevision: 'sha256:rev-1' });
		const request = baseRequest({
			sourceRevision: 'sha256:rev-2',
			expectedCurrentSourceRevision: 'sha256:rev-1',
		});
		const result = decidePacketWrite(current, request);
		expect(result.decision).toBe('ADVANCE_SOURCE_REVISION');
	});

	it('handles a current row with no sourceRevision recorded yet, advancing correctly when the caller proves it read null', () => {
		const current = existingRow({ sourceRevision: null });
		const request = baseRequest({
			sourceRevision: 'sha256:rev-1',
			expectedCurrentSourceRevision: null,
		});
		const result = decidePacketWrite(current, request);
		expect(result.decision).toBe('ADVANCE_SOURCE_REVISION');
	});

	it('never lets ON CONFLICT-style ambiguity slip through: identity conflict takes precedence over everything else', () => {
		// Same packetKey, sourceRef differs AND sourceRevision missing -- identity
		// must be checked first, per the documented precedence order.
		const current = existingRow({ sourceRef: 'src/a.ts' });
		const request = baseRequest({ sourceRef: 'src/b.ts', sourceRevision: null });
		const result = decidePacketWrite(current, request);
		expect(result.decision).toBe('IDENTITY_CONFLICT');
	});

	it('is a pure function: identical inputs always produce identical decisions', () => {
		const current = existingRow();
		const request = baseRequest();
		const first = decidePacketWrite(current, request);
		const second = decidePacketWrite(current, request);
		expect(first).toEqual(second);
	});
});
