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

describe('Graphify packet-incidence candidate materializer', () => {
	beforeEach(() => queryMock.mockReset());

	it('joins, resolves, and seals one revision-qualified candidate without persistence', async () => {
		queryMock
			.mockResolvedValueOnce({ rows: [
				{ stable_symbol_key: edge.subjectStableSymbolKey, workspace_revision: edge.workspaceRevision, code_source_revision: edge.sourceRevision, packet_key: 'packet:subject', source_ref: edge.sourceRef, source_revision: edge.sourceRevision },
				{ stable_symbol_key: edge.objectStableSymbolKey, workspace_revision: edge.workspaceRevision, code_source_revision: 'source-b-r1', packet_key: 'packet:neighbor', source_ref: 'src/b.ts', source_revision: 'source-b-r1' },
			] })
			.mockResolvedValueOnce({ rows: [
				{ packet_key: 'packet:subject', source_ref: 'src/a.ts', source_revision: edge.sourceRevision },
				{ packet_key: 'packet:neighbor', source_ref: 'src/b.ts', source_revision: 'source-b-r1' },
			] });

		const { materializeGraphifyPacketIncidenceCandidateV1 } = await import('./graphify-packet-incidence-materializer-v1.js');
		const result = await materializeGraphifyPacketIncidenceCandidateV1(edge, snapshot);

		expect(result).toMatchObject({
			canonicalId: 'packet:00000000-0000-5000-8000-000000000001',
			neighborCanonicalId: 'packet:00000000-0000-5000-8000-000000000002',
			workspaceRevision: edge.workspaceRevision,
			graphRevision: snapshot.graphRevision,
			producerId: 'graphify-packet-incidence-projection-v1',
			producerRevision: 'graphify-packet-incidence-projection-v1@1',
		});
		expect(result.evidenceRefs).toContain('graph-edge:reference-1');
		expect(result.lineageChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(queryMock).toHaveBeenCalledTimes(2);
		expect(queryMock.mock.calls.every(([sql]) => !String(sql).includes('INSERT'))).toBe(true);
	});
});
