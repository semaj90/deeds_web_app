import { describe, expect, it } from 'vitest';
import type { IncidenceProjectionEdgeV1 } from './incidence-projection-v1.js';
import {
	checksumArrowIpc,
	deserializeIncidenceEdgesFromArrowIpc,
	serializeIncidenceEdgesToArrowIpc,
} from './incidence-edge-arrow-artifact-v1.js';

const edges: IncidenceProjectionEdgeV1[] = [
	{ srcGpuNodeId: 5, dstGpuNodeId: 0, edgeType: 'INCIDENT_TO', participantRole: 'caller', participantOrdinal: 0, relationId: 'call-binding:42', weight: 1 },
	{ srcGpuNodeId: 5, dstGpuNodeId: 1, edgeType: 'INCIDENT_TO', participantRole: 'callee', participantOrdinal: 1, relationId: 'call-binding:42', weight: 1 },
];

describe('GRAPH-PROD-01 incidence edge Arrow IPC artifact', () => {
	it('round-trips a non-empty edge set losslessly', () => {
		const bytes = serializeIncidenceEdgesToArrowIpc(edges);
		const back = deserializeIncidenceEdgesFromArrowIpc(bytes);
		expect(back).toEqual(edges);
	});

	it('round-trips an empty edge set (the current real production state)', () => {
		const bytes = serializeIncidenceEdgesToArrowIpc([]);
		const back = deserializeIncidenceEdgesFromArrowIpc(bytes);
		expect(back).toEqual([]);
	});

	it('is deterministic — same input produces the same checksum', () => {
		const first = checksumArrowIpc(serializeIncidenceEdgesToArrowIpc(edges));
		const second = checksumArrowIpc(serializeIncidenceEdgesToArrowIpc(edges));
		expect(first).toBe(second);
		expect(first).toMatch(/^[0-9a-f]{64}$/);
	});

	it('produces a different checksum for a different edge set', () => {
		const a = checksumArrowIpc(serializeIncidenceEdgesToArrowIpc(edges));
		const b = checksumArrowIpc(serializeIncidenceEdgesToArrowIpc([edges[0]!]));
		expect(a).not.toBe(b);
	});
});
