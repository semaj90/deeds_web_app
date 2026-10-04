import { describe, expect, it } from 'vitest';
import {
	createPacketIncidenceLineageV1,
	PacketIncidenceLineageV1Schema,
	verifyPacketIncidenceLineageV1,
} from './packet-incidence-lineage-v1.js';

const input = {
	packetKey: 'packet:0123456789ab',
	canonicalId: 'packet:00000000-0000-5000-8000-000000000001',
	sourceRevision: 'sha256:source-a',
	neighborPacketKey: 'packet:abcdef012345',
	neighborCanonicalId: 'packet:00000000-0000-5000-8000-000000000002',
	neighborSourceRevision: 'sha256:source-b',
	edgeType: 'IMPORTS',
	workspaceRevision: 'workspace-r1',
	graphRevision: 'graph-r1',
	producerId: 'graphify-packet-incidence-projection-v1',
	producerRevision: 'graphify-packet-incidence-projection-v1@1',
	evidenceRefs: ['edge:1', 'source-span:src/a.ts:1-2'],
};

describe('PacketIncidenceLineageV1 compatibility export', () => {
	it('uses the canonical lineage owner and deterministic checksums', () => {
		const first = createPacketIncidenceLineageV1(input);
		const second = createPacketIncidenceLineageV1({ ...input, evidenceRefs: [...input.evidenceRefs].reverse() });

		expect(first).toEqual(second);
		expect(PacketIncidenceLineageV1Schema.parse(first)).toEqual(first);
		expect(verifyPacketIncidenceLineageV1(first, {
			workspaceRevision: input.workspaceRevision,
			graphRevision: input.graphRevision,
			resolvePacket: (packetKey) => packetKey === input.packetKey
				? { canonicalId: input.canonicalId, sourceRevision: input.sourceRevision }
				: packetKey === input.neighborPacketKey
					? { canonicalId: input.neighborCanonicalId, sourceRevision: input.neighborSourceRevision }
					: null,
		})).toMatchObject({ status: 'LINEAGE_PROVEN', failed: [] });
	});

	it('rejects tampering and empty evidence through the canonical contract', () => {
		const lineage = createPacketIncidenceLineageV1(input);
		const tampered = PacketIncidenceLineageV1Schema.parse({ ...lineage, edgeType: 'CALLS' });
		expect(verifyPacketIncidenceLineageV1(tampered, {
			workspaceRevision: input.workspaceRevision,
			graphRevision: input.graphRevision,
			resolvePacket: (packetKey) => packetKey === input.packetKey
				? { canonicalId: input.canonicalId, sourceRevision: input.sourceRevision }
				: packetKey === input.neighborPacketKey
					? { canonicalId: input.neighborCanonicalId, sourceRevision: input.neighborSourceRevision }
					: null,
		})).toMatchObject({ status: 'LINEAGE_UNPROVEN' });
		expect(() => createPacketIncidenceLineageV1({ ...input, evidenceRefs: [] })).toThrow('PACKET_INCIDENCE_MISSING_FIELD: evidenceRefs');
	});
});
