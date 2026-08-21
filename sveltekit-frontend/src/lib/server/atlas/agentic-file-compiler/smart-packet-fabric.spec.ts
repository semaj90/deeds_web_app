import { describe, expect, it } from 'vitest';
import {
	ActionAttemptSchema,
	ActionReceiptSchema,
	GpuTensorArtifactSchema,
	SmartRpcPacketSchema,
	WorkflowPlanSchema,
	buildActionReceipt,
	buildArtifactRef,
	buildPrefillReceipt,
	buildSmartRpcPacket,
	buildWorkflowAction,
	buildWorkflowPlan,
} from './smart-packet-fabric.js';
import { canonicalPacketHash } from './canonical-packet-hash.js';

describe('smart packet fabric', () => {
	const revisions = {
		workspaceRevision: 'ws-7',
		sourceRevision: 'src-11',
		graphRevision: 'graph-3',
		representationRevision: 'repr-9',
		featureRevision: 'feat-4',
	};

	it('builds typed artifact refs without embedding tensor payloads', () => {
		const ref = buildArtifactRef({
			artifactId: 'semantic:C517:19472',
			canonicalId: 'C517',
			kind: 'semantic-row',
			revisions,
			checksum: 'semantic-row-checksum',
			location: { type: 'arrow', snapshotId: 'semantic-7', ordinal: 19472 },
		});
		expect(ref.location).toEqual({ type: 'arrow', snapshotId: 'semantic-7', ordinal: 19472 });
		expect(JSON.stringify(ref)).not.toContain('embedding');
	});

	it('binds structural identity to semantic/graph/feature ordinals', () => {
		const packet = buildSmartRpcPacket({
			packetId: 'packet-1',
			packetKey: 'P992',
			canonicalId: 'C517',
			revisions,
			structural: {
				symbolVersionId: 'S331',
				treeNodeId: 'T8421',
				nodeType: 'function_declaration',
				astPath: [2, 1, 0],
				parentAstPath: [2, 1],
				sourceRef: 'src/lib/example.ts',
				startByte: 10,
				endByte: 80,
			},
			ordinals: {
				semanticOrdinal: 19472,
				graphOrdinal: 7128,
				featureOrdinal: 19472,
				tensorRowOrdinal: 19472,
			},
			evidenceRefs: ['ev-b', 'ev-a', 'ev-a'],
			producerRevision: 'agentic-file-compiler@smart-packet-v1',
		});
		expect(packet.evidenceRefs).toEqual(['ev-a', 'ev-b']);
		expect(packet.ordinals.semanticOrdinal).toBe(19472);
		expect(packet.contentChecksum).toMatch(/^[a-f0-9]{64}$/);
		expect(SmartRpcPacketSchema.parse(packet)).toEqual(packet);
	});

	it('rejects invalid CUDA IPC leases and AST spans', () => {
		expect(() => GpuTensorArtifactSchema.parse({
			tileId: 'tile-1', dtype: 'bf16', shape: [32, 768], byteLength: 49152,
			checksum: 'x', residency: 'mmap', cudaIpcLeaseRef: 'lease-1',
		})).toThrow(/CUDA IPC lease requires cuda residency/);

		expect(() => buildSmartRpcPacket({
			packetId: 'packet-bad', packetKey: 'P1', canonicalId: 'C1', revisions,
			structural: { sourceRef: 'x.ts', startByte: 20, endByte: 10 },
			ordinals: {}, evidenceRefs: [], producerRevision: 'test',
		})).toThrow(/endByte must be >= startByte/);
	});

	it('keeps workflow identity Atlas-owned and retry identity attempt-owned', () => {
		const action = buildWorkflowAction({
			actionId: 'A050', workflowId: 'atlas.prefill.compile', workflowRevision: 1,
			runId: 'run-55', dagNodeId: 'rank-candidates', sequence: 50,
			kind: 'RANK', lane: 'gpu', inputArtifacts: [], expectedOutputKinds: ['tensor-tile'],
			dependencies: [], budget: { maxCandidates: 256, maxVramBytes: 8_000_000_000 },
			executor: { class: 'gpu', capability: 'atlas.rank.candidates.v1' },
			idempotencyKey: 'run-55:A050:feat-4', revisions,
		});

		const plan = buildWorkflowPlan({
			workflowId: 'atlas.prefill.compile', workflowRevision: 1, runId: 'run-55',
			requestId: 'req-55', contextManifestId: 'ctx-55', revisions,
			actions: [action], entryActionIds: ['A050'], terminalActionIds: ['A050'],
		});
		expect(WorkflowPlanSchema.parse(plan).planChecksum).toMatch(/^[a-f0-9]{64}$/);

		const attempt1 = ActionAttemptSchema.parse({
			schema: 'atlas.action-attempt.v1', attemptId: 'attempt-A050-1', actionId: 'A050',
			runId: 'run-55', attempt: 1, executorId: 'gpu-worker-1', executorRevision: 'gpu@7',
			transport: 'grpc', startedAt: '2026-08-21T15:00:00.000Z',
		});
		const attempt2 = { ...attempt1, attemptId: 'attempt-A050-2', attempt: 2 };
		expect(attempt2.actionId).toBe(attempt1.actionId);
		expect(attempt2.attemptId).not.toBe(attempt1.attemptId);
	});

	it('emits action receipts as execution proof, separate from feature readiness', () => {
		const receipt = buildActionReceipt({
			actionId: 'A050', attemptId: 'attempt-A050-2', runId: 'run-55',
			executorId: 'gpu-worker-1', executorRevision: 'gpu@7',
			startedAt: '2026-08-21T15:00:00.000Z', completedAt: '2026-08-21T15:00:00.012Z',
			inputs: [], outputs: [], observed: { latencyMs: 12, candidatesIn: 256, candidatesOut: 24 },
			result: 'SUCCESS',
		});
		expect(ActionReceiptSchema.parse(receipt)).toEqual(receipt);
		expect(receipt).not.toHaveProperty('featureStatus');
	});

	it('computes compiled prefill identity from revisions and promoted artifacts', () => {
		const a = buildPrefillReceipt({
			prefillReceiptId: 'prefill-1', contextManifestChecksum: 'ctx', promptPlanChecksum: 'prompt',
			modelRevision: 'model-7', adapterRevision: 'adapter-3', promptTemplateRevision: 'tmpl-5',
			tokenizerRevision: 'tok-2', toolSchemaRevision: 'tools-4',
			evidenceRevisions: ['e2', 'e1', 'e1'], tensorArtifactRefs: ['t2', 't1'],
			instructionRefs: ['i1'], producerRevision: 'prefill@1',
		});
		const b = buildPrefillReceipt({
			...a,
			prefillReceiptId: 'prefill-2',
			evidenceRevisions: ['e1', 'e2'], tensorArtifactRefs: ['t1', 't2'],
		});
		expect(a.prefillIdentity).toBe(b.prefillIdentity);
	});

	it('canonical hashing normalizes key order, NFC strings, and negative zero', () => {
		expect(canonicalPacketHash({ b: -0, a: 'e\u0301' }))
			.toBe(canonicalPacketHash({ a: 'é', b: 0 }));
		expect(() => canonicalPacketHash({ bad: Number.NaN })).toThrow(/finite numbers/);
	});
});
