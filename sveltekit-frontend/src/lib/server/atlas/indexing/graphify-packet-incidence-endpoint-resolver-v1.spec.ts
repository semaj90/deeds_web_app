// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGraphRevisionSnapshotV1 } from '../lineage/graph-revision-snapshot-v1.js';

const queryMock = vi.fn();
vi.mock('$lib/server/db/client.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));
vi.mock('../identity/packet-identity-resolver.js', () => ({
	resolvePacketKeyResolutionV2: async (key: string) => {
		const canonicalPacketKey = key === 'packet:subject'
			? 'packet:00000000-0000-5000-8000-000000000001'
			: key === 'packet:neighbor' ? 'packet:00000000-0000-5000-8000-000000000002' : null;
		if (!canonicalPacketKey) throw new Error('unresolved');
		return { canonicalPacketKey, storagePacketKey: key };
	},
}));

const edge = {
	schema: 'atlas.graphify-edge-projection-candidate.v1' as const,
	workspaceId: '00000000-0000-4000-8000-000000000010',
	workspaceRevision: 'git:abcdef1234567',
	sourceRef: 'src/a.ts',
	sourceRevision: 'source-a-r1',
	subjectStableSymbolKey: 'symbol:src/a.ts#source',
	predicate: 'IMPORTS',
	objectStableSymbolKey: 'symbol:src/b.ts#target',
	unresolvedTarget: null,
	evidenceKind: 'AST_REFERENCE',
	evidenceSpan: { startByte: 10, endByte: 20, startRow: 1, endRow: 1 },
	confidence: 1,
	evidenceRefs: ['source-span:src/a.ts:1-2'],
	referenceId: 'reference-1',
};

const snapshot = buildGraphRevisionSnapshotV1({
	workspaceRevisionKey: edge.workspaceRevision,
	graphRevision: `sha256:${'a'.repeat(64)}`,
	producerId: 'graphify',
	producerRevision: 'graphify@1',
	sourceRevisionCoverage: { qualified: 2, total: 2 },
});

function joinRows(overrides: Record<string, unknown> = {}) {
	return [
		{
			stable_symbol_key: edge.subjectStableSymbolKey,
			workspace_revision: edge.workspaceRevision,
			code_source_revision: edge.sourceRevision,
			packet_key: 'packet:subject',
			source_ref: edge.sourceRef,
			source_revision: edge.sourceRevision,
			...overrides,
		},
		{
			stable_symbol_key: edge.objectStableSymbolKey,
			workspace_revision: edge.workspaceRevision,
			code_source_revision: 'source-b-r1',
			packet_key: 'packet:neighbor',
			source_ref: 'src/b.ts',
			source_revision: 'source-b-r1',
		},
	];
}

describe('Graphify packet-incidence endpoint resolver', () => {
	beforeEach(() => queryMock.mockReset());

	it('joins exact source spans and resolves both endpoints to canonical identity', async () => {
		queryMock
			.mockResolvedValueOnce({ rows: joinRows() })
			.mockResolvedValueOnce({ rows: [
				{ packet_key: 'packet:subject', source_ref: 'src/a.ts', source_revision: 'source-a-r1' },
				{ packet_key: 'packet:neighbor', source_ref: 'src/b.ts', source_revision: 'source-b-r1' },
			] });

		const { resolveGraphifyPacketIncidenceEndpointsV1 } = await import('./graphify-packet-incidence-endpoint-resolver-v1.js');
		const result = await resolveGraphifyPacketIncidenceEndpointsV1(edge, snapshot);

		expect(result.packet).toMatchObject({
			status: 'RESOLVED',
			canonicalId: 'packet:00000000-0000-5000-8000-000000000001',
			sourceRevision: 'source-a-r1',
			graphEndpointKey: edge.subjectStableSymbolKey,
			graphRevision: snapshot.graphRevision,
		});
		expect(result.neighbor).toMatchObject({
			status: 'RESOLVED',
			canonicalId: 'packet:00000000-0000-5000-8000-000000000002',
			sourceRevision: 'source-b-r1',
			graphEndpointKey: edge.objectStableSymbolKey,
			graphRevision: snapshot.graphRevision,
		});
		expect(queryMock).toHaveBeenCalledTimes(2);
	});

	it('rejects missing, ambiguous, and revision-mismatched Graphify joins', async () => {
		const { resolveGraphifyPacketIncidenceEndpointsV1 } = await import('./graphify-packet-incidence-endpoint-resolver-v1.js');
		queryMock.mockResolvedValueOnce({ rows: joinRows().slice(0, 1) });
		await expect(resolveGraphifyPacketIncidenceEndpointsV1(edge, snapshot)).rejects.toThrow('GRAPHIFY_PACKET_NEIGHBOR_JOIN_NOT_UNIQUE:0');

		queryMock.mockReset().mockResolvedValueOnce({ rows: [...joinRows(), joinRows()[0]] });
		await expect(resolveGraphifyPacketIncidenceEndpointsV1(edge, snapshot)).rejects.toThrow('GRAPHIFY_PACKET_SUBJECT_JOIN_NOT_UNIQUE:2');

		queryMock.mockReset().mockResolvedValueOnce({ rows: joinRows({ source_revision: 'stale-source' }) });
		await expect(resolveGraphifyPacketIncidenceEndpointsV1(edge, snapshot)).rejects.toThrow('GRAPHIFY_PACKET_SUBJECT_REVISION_BINDING_MISMATCH');
	});

	it('rejects an endpoint whose canonical packet identity cannot be resolved', async () => {
		queryMock
			.mockResolvedValueOnce({ rows: joinRows({ packet_key: 'packet:unknown' }) })
			.mockResolvedValueOnce({ rows: [
				{ packet_key: 'packet:unknown', source_ref: 'src/a.ts', source_revision: 'source-a-r1' },
				{ packet_key: 'packet:neighbor', source_ref: 'src/b.ts', source_revision: 'source-b-r1' },
			] });
		const { resolveGraphifyPacketIncidenceEndpointsV1 } = await import('./graphify-packet-incidence-endpoint-resolver-v1.js');
		await expect(resolveGraphifyPacketIncidenceEndpointsV1(edge, snapshot)).rejects.toThrow('GRAPHIFY_PACKET_ENDPOINT_REVISION_UNPROVEN:packet:unknown');
	});

	it('rejects invalid or mismatched frozen graph snapshots', async () => {
		const { resolveGraphifyPacketIncidenceEndpointsV1 } = await import('./graphify-packet-incidence-endpoint-resolver-v1.js');
		await expect(resolveGraphifyPacketIncidenceEndpointsV1(edge, { ...snapshot, snapshotChecksum: 'sha256:bad' }))
			.rejects.toThrow('GRAPHIFY_PACKET_INCIDENCE_SNAPSHOT_INVALID');
		await expect(resolveGraphifyPacketIncidenceEndpointsV1({ ...edge, workspaceRevision: 'git:7654321' }, snapshot))
			.rejects.toThrow('GRAPHIFY_PACKET_INCIDENCE_WORKSPACE_SNAPSHOT_MISMATCH');
		expect(queryMock).not.toHaveBeenCalled();
	});
});
