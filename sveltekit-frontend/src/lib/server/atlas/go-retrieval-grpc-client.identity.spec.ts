import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
	request: null as Record<string, any> | null,
	response: null as Record<string, any> | null,
}));

vi.mock('@grpc/grpc-js', () => ({
	Metadata: class {
		add() {}
	},
	credentials: { createInsecure: () => ({}) },
	loadPackageDefinition: () => ({
		yorha: {
			retrieval: {
				RetrievalService: class {
					close() {}
					searchCodebase(request: Record<string, any>, _metadata: unknown, _options: unknown, callback: (error: Error | null, result?: unknown) => void) {
						captured.request = request;
						callback(null, captured.response);
					}
				},
			},
		},
	}),
}));

vi.mock('@grpc/proto-loader', () => ({ load: async () => ({}) }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { RETRIEVAL_GRPC_URL: '127.0.0.1:50053' } }));

import { createAtlasRuntimeContext } from './atlas-runtime-context.js';
import { closeRetrievalGrpcClient, retrieveFromGo } from './go-retrieval-grpc-client.js';

describe('Go Retrieval gRPC identity contract', () => {
	beforeEach(() => {
		captured.request = null;
		captured.response = null;
	});

	afterEach(async () => {
		await closeRetrievalGrpcClient();
	});

	it('passes packetKey and sourceRevision verbatim and admits the matching protobuf receipt/chunk', async () => {
		const packetKey = 'packet:Owner/Exact-Identity';
		const sourceRevision = 'sha256:Case-Sensitive-Source-Revision';
		const runtime = createAtlasRuntimeContext({
			runId: 'run-identity',
			threadId: 'thread-identity',
			resourceId: 'resource-identity',
			workspaceId: 'workspace-identity',
			workspaceRevision: 'workspace-revision-exact',
			packetKey,
			packetRevision: 'packet-revision-exact',
			sourceRevision,
		});
		captured.response = {
			receipt: {
				receiptId: 'receipt-1',
				receiptChecksum: 'sha256:receipt-checksum',
				toolCallId: 'tool-call-1',
				toolName: 'atlas.retrieve',
				runId: runtime.runId,
				workspaceId: runtime.workspaceId,
				workspaceRevision: runtime.workspaceRevision,
				packetKey,
				packetRevision: runtime.packetRevision,
				sourceRevision,
				succeeded: true,
				errorCode: null,
				retrievalConfidence: 0.9,
				evidenceCount: 1,
				validationStatus: 'PASS',
				outputChecksum: 'sha256:output',
				writesPerformed: false,
				canonicalAuthority: false,
			},
			chunks: [{
				packetKey,
				sourceRef: 'repo:workspace:src/example.ts',
				contentHash: 'sha256:content',
				workspaceRevision: runtime.workspaceRevision,
				sourceRevision,
				candidateId: 'candidate-1',
				score: 0.9,
			}, {
				packetKey,
				sourceRef: 'repo:workspace:src/stale.ts',
				contentHash: 'sha256:stale-content',
				workspaceRevision: runtime.workspaceRevision,
				sourceRevision: 'sha256:stale-source-revision',
				candidateId: 'candidate-stale',
				score: 0.99,
			}],
		};

		const result = await retrieveFromGo(runtime, 'identity contract');

		expect(captured.request?.atlasContext).toEqual(expect.objectContaining({
			packetKey,
			sourceRevision,
			workspaceRevision: runtime.workspaceRevision,
			packetRevision: runtime.packetRevision,
		}));
		expect(result.evidence).toEqual([expect.objectContaining({ packetKey, sourceRevision })]);
		expect(result.receipt).toEqual(expect.objectContaining({ packetKey, sourceRevision }));
	});
});
