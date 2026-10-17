// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { buildGraphRevisionSnapshotV1 } from '../lineage/graph-revision-snapshot-v1.js';
import type { GraphifyStructuralProjectionPipelineV1 } from './graphify-structural-projection-pipeline-v1.js';

const queryMock = vi.fn();
vi.mock('$lib/server/db/client.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));
vi.mock('../identity/packet-identity-resolver.js', () => ({
	resolvePacketKeyResolutionV2: async (key: string) => {
		const canonicalPacketKey = ({
			'packet:subject': 'packet:00000000-0000-5000-8000-000000000001',
			'packet:neighbor': 'packet:00000000-0000-5000-8000-000000000002',
			'packet:subject-2': 'packet:00000000-0000-5000-8000-000000000003',
			'packet:neighbor-2': 'packet:00000000-0000-5000-8000-000000000004',
		} as Record<string, string>)[key] ?? null;
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
	objectSourceRef: 'src/b.ts',
	objectSourceRevision: 'source-b-r1',
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
				{ stable_symbol_key: edge.subjectStableSymbolKey, workspace_revision: edge.workspaceRevision, code_source_revision: edge.sourceRevision, packet_key: 'packet:subject', source_ref: edge.sourceRef, source_revision: edge.sourceRevision, workspace_revision_key: edge.workspaceRevision },
				{ stable_symbol_key: edge.objectStableSymbolKey, workspace_revision: edge.workspaceRevision, code_source_revision: 'source-b-r1', packet_key: 'packet:neighbor', source_ref: 'src/b.ts', source_revision: 'source-b-r1', workspace_revision_key: edge.workspaceRevision },
			] })
			.mockResolvedValueOnce({ rows: [
				{ packet_key: 'packet:subject', source_ref: 'src/a.ts', source_revision: edge.sourceRevision, workspace_revision_key: edge.workspaceRevision },
				{ packet_key: 'packet:neighbor', source_ref: 'src/b.ts', source_revision: 'source-b-r1', workspace_revision_key: edge.workspaceRevision },
			] });

		const { materializeGraphifyPacketIncidenceCandidateV1 } = await import('./graphify-packet-incidence-materializer-v1.js');
		const results = await materializeGraphifyPacketIncidenceCandidateV1(edge, snapshot);
		const result = results[0]!;

		expect(results).toHaveLength(1);
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

	it('preserves exact one-to-many chunk bindings instead of rejecting a symbol that spans multiple packets', async () => {
		const subject2 = { ...queryRow(edge.subjectStableSymbolKey, 'packet:subject-2', 'src/a.ts', edge.sourceRevision) };
		const neighbor2 = { ...queryRow(edge.objectStableSymbolKey, 'packet:neighbor-2', 'src/b.ts', 'source-b-r1') };
		const allRows = [
			queryRow(edge.subjectStableSymbolKey, 'packet:subject', 'src/a.ts', edge.sourceRevision),
			subject2,
			queryRow(edge.objectStableSymbolKey, 'packet:neighbor', 'src/b.ts', 'source-b-r1'),
			neighbor2,
		];
		queryMock
			.mockResolvedValueOnce({ rows: allRows })
			.mockResolvedValueOnce({ rows: allRows.map(({ stable_symbol_key, workspace_revision, code_source_revision, ...row }) => row) });

		const { materializeGraphifyPacketIncidenceCandidateV1 } = await import('./graphify-packet-incidence-materializer-v1.js');
		const results = await materializeGraphifyPacketIncidenceCandidateV1(edge, snapshot);

		expect(results).toHaveLength(4);
		expect(results.map((row) => [row.packetKey, row.neighborPacketKey])).toEqual([
			['packet:subject', 'packet:neighbor'],
			['packet:subject', 'packet:neighbor-2'],
			['packet:subject-2', 'packet:neighbor'],
			['packet:subject-2', 'packet:neighbor-2'],
		]);
		expect(new Set(results.map((row) => row.lineageChecksum)).size).toBe(4);
		expect(queryMock.mock.calls.every(([sql]) => !String(sql).includes('INSERT'))).toBe(true);
	});

	it('joins replay-admitted structural edges to packet-bound GraphSnapshot candidates', async () => {
		const sourceBytes = Buffer.from('function caller() { helper(); }\n', 'utf8');
		const targetSourceBytes = Buffer.from('export function helper() {}\n', 'utf8');
		const workspaceRevision = `sha256:${'b'.repeat(64)}`;
		const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
		const targetSourceRevision = `sha256:${createHash('sha256').update(targetSourceBytes).digest('hex')}`;
		const admittedEdge = {
			...edge,
			workspaceRevision,
			sourceRevision,
			objectSourceRevision: targetSourceRevision,
			predicate: 'CALLS',
			evidenceSpan: { startByte: sourceBytes.indexOf('helper()'), endByte: sourceBytes.indexOf('helper()') + Buffer.byteLength('helper()'), startRow: 0, endRow: 0 },
		};
		const symbol = (input: {
			stableSymbolKey: string;
			sourceRef: string;
			sourceRevision: string;
			bytes: Buffer;
			fileId: string;
		}) => {
			const endByte = input.bytes.indexOf(0x0a);
			return {
				schema: 'atlas.graphify-symbol-projection-candidate.v1' as const,
				fileId: input.fileId,
				workspaceRevision,
				sourceRef: input.sourceRef,
				sourceRevision: input.sourceRevision,
				stableSymbolKey: input.stableSymbolKey,
				symbolKind: 'function',
				qualifiedName: input.stableSymbolKey,
				parentStableSymbolKey: null,
				startByte: 0,
				endByte,
				startRow: 0,
				endRow: 0,
				signatureText: null,
				sourceTextHash: createHash('sha256').update(input.bytes.slice(0, endByte)).digest('hex'),
				astFingerprint: 'a'.repeat(64),
				upstreamNodeId: input.stableSymbolKey,
				upstreamSymbolId: null,
				upstreamChunkId: `chunk:${input.stableSymbolKey}`,
				extractorRevision: 'extractor:v1'
			};
		};
		const subjectSymbol = symbol({ stableSymbolKey: admittedEdge.subjectStableSymbolKey, sourceRef: admittedEdge.sourceRef, sourceRevision, bytes: sourceBytes, fileId: '77777777-7777-4777-8777-777777777777' });
		const targetSymbol = symbol({ stableSymbolKey: admittedEdge.objectStableSymbolKey!, sourceRef: admittedEdge.objectSourceRef!, sourceRevision: targetSourceRevision, bytes: targetSourceBytes, fileId: '88888888-8888-4888-8888-888888888888' });
		queryMock
			.mockResolvedValueOnce({ rows: [
				{ stable_symbol_key: admittedEdge.subjectStableSymbolKey, workspace_revision: workspaceRevision, code_source_revision: sourceRevision, packet_key: 'packet:subject', source_ref: admittedEdge.sourceRef, source_revision: sourceRevision, workspace_revision_key: workspaceRevision },
				{ stable_symbol_key: admittedEdge.objectStableSymbolKey, workspace_revision: workspaceRevision, code_source_revision: targetSourceRevision, packet_key: 'packet:neighbor', source_ref: admittedEdge.objectSourceRef, source_revision: targetSourceRevision, workspace_revision_key: workspaceRevision },
			] })
			.mockResolvedValueOnce({ rows: [
				{ packet_key: 'packet:subject', source_ref: admittedEdge.sourceRef, source_revision: sourceRevision, workspace_revision_key: workspaceRevision },
				{ packet_key: 'packet:neighbor', source_ref: admittedEdge.objectSourceRef, source_revision: targetSourceRevision, workspace_revision_key: workspaceRevision },
			] });
		const admittedSnapshot = buildGraphRevisionSnapshotV1({
			workspaceRevisionKey: workspaceRevision,
			graphRevision: `sha256:${'c'.repeat(64)}`,
			producerId: 'graphify',
			producerRevision: 'graphify@1',
			sourceRevisionCoverage: { qualified: 2, total: 2 },
		});
		const { resolveGraphifyPacketEdgesForSnapshotV1 } = await import('./graphify-packet-incidence-materializer-v1.js');
		const result = await resolveGraphifyPacketEdgesForSnapshotV1({
			batches: [{ edge: admittedEdge, subjectSymbol, targetSymbol, sourceBytes, targetSourceBytes }],
			snapshot: admittedSnapshot,
			replayContext: {
				workspaceRevisionKey: workspaceRevision,
				graphRevision: admittedSnapshot.graphRevision,
				producerRevision: 'edge-replay:v1',
				targetSourceRevisionOf: (key) => key === admittedEdge.objectStableSymbolKey ? targetSourceRevision : null,
			}
		});

		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0]).toMatchObject({
			sourcePacketKey: 'packet:subject',
			targetPacketKey: 'packet:neighbor',
			sourceSymbolKey: admittedEdge.subjectStableSymbolKey,
			targetSymbolKey: admittedEdge.objectStableSymbolKey,
			graphRevision: 'c'.repeat(64),
		});
		expect(result.replayCounts.ADMITTED).toBe(1);
		expect(result.rejectedReferenceIds).toEqual([]);
		expect(queryMock.mock.calls.every(([sql]) => !String(sql).includes('INSERT'))).toBe(true);
	});

	it('builds deterministic cross-file source batches only from matching pipeline revisions and bytes', async () => {
		const sourceBytes = Buffer.from('function caller() { helper(); }\n', 'utf8');
		const targetBytes = Buffer.from('export function helper() {}\n', 'utf8');
		const workspaceRevision = `sha256:${'b'.repeat(64)}`;
		const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
		const targetRevision = `sha256:${createHash('sha256').update(targetBytes).digest('hex')}`;
		const structuralEdge = {
			...edge,
			workspaceRevision,
			sourceRef: 'src/a.ts',
			sourceRevision,
			objectSourceRef: 'src/b.ts',
			objectSourceRevision: targetRevision,
			predicate: 'CALLS',
		};
		const makeSymbol = (input: { key: string; sourceRef: string; revision: string; bytes: Buffer; fileId: string }) => {
			const endByte = input.bytes.indexOf(0x0a);
			return {
				schema: 'atlas.graphify-symbol-projection-candidate.v1' as const,
				fileId: input.fileId,
				workspaceRevision,
				sourceRef: input.sourceRef,
				sourceRevision: input.revision,
				stableSymbolKey: input.key,
				symbolKind: 'function',
				qualifiedName: input.key,
				parentStableSymbolKey: null,
				startByte: 0,
				endByte,
				startRow: 0,
				endRow: 0,
				signatureText: null,
				sourceTextHash: createHash('sha256').update(input.bytes.slice(0, endByte)).digest('hex'),
				astFingerprint: 'a'.repeat(64),
				upstreamNodeId: input.key,
				upstreamSymbolId: null,
				upstreamChunkId: `chunk:${input.key}`,
				extractorRevision: 'extractor:v1'
			};
		};
		const subject = makeSymbol({ key: structuralEdge.subjectStableSymbolKey, sourceRef: 'src/a.ts', revision: sourceRevision, bytes: sourceBytes, fileId: '77777777-7777-4777-8777-777777777777' });
		const target = makeSymbol({ key: structuralEdge.objectStableSymbolKey!, sourceRef: 'src/b.ts', revision: targetRevision, bytes: targetBytes, fileId: '88888888-8888-4888-8888-888888888888' });
		const makePipeline = (sourceRef: string, revision: string, symbolRows: typeof subject[], edgeRows: typeof structuralEdge[]) => ({
			schema: 'atlas.graphify-structural-projection-pipeline.v1',
			status: 'MAPPED',
			sourceRef,
			sourceRevision: revision,
			workspaceRevision,
			compilation: null,
			batch: { sourceRef, sourceRevision: revision, workspaceRevision, symbols: symbolRows, edges: edgeRows },
			diagnostics: [],
			canonicalAuthority: false,
			writesPerformed: false,
			checksum: `${'f'.repeat(64)}`
		}) as unknown as GraphifyStructuralProjectionPipelineV1;
		const pipelines = [
			makePipeline('src/a.ts', sourceRevision, [subject], [structuralEdge]),
			makePipeline('src/b.ts', targetRevision, [target], []),
		];
		const { buildGraphifyPacketEdgeSourceBatchesV1 } = await import('./graphify-packet-incidence-materializer-v1.js');
		const input = { pipelines, sourceBytesBySourceRef: new Map([['src/a.ts', sourceBytes], ['src/b.ts', targetBytes]]) };
		const built = buildGraphifyPacketEdgeSourceBatchesV1(input);
		const replay = buildGraphifyPacketEdgeSourceBatchesV1(input);

		expect(built.batches).toHaveLength(1);
		expect(built.batches[0]).toMatchObject({ edge: structuralEdge, subjectSymbol: subject, targetSymbol: target });
		expect(built.rejected).toEqual([]);
		expect(built.checksum).toBe(replay.checksum);
		expect(built).toMatchObject({ canonicalAuthority: false, writesPerformed: false });
		expect(buildGraphifyPacketEdgeSourceBatchesV1({ ...input, sourceBytesBySourceRef: new Map([['src/a.ts', sourceBytes], ['src/b.ts', Buffer.from('changed')]]) }).rejected)
			.toContainEqual({ referenceId: structuralEdge.referenceId, reason: 'TARGET_SOURCE_PIPELINE_UNAVAILABLE_OR_MISMATCHED' });
	});
});

function queryRow(stable_symbol_key: string, packet_key: string, source_ref: string, source_revision: string) {
	return {
		stable_symbol_key,
		workspace_revision: edge.workspaceRevision,
		code_source_revision: source_revision,
		packet_key,
		source_ref,
		source_revision,
		workspace_revision_key: edge.workspaceRevision,
	};
}
