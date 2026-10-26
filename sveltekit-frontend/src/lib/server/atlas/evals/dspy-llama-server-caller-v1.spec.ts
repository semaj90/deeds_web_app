import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildContextManifestV2 } from '../graph/context-manifest-v2.js';
import { executeDspyLlamaServerRepair } from './dspy-llama-server-caller-v1.js';

const manifest = buildContextManifestV2({
	schema: 'atlas.context-manifest.v1',
	requestId: 'request-1',
	snapshotId: 'snapshot-1',
	graphRevision: 'graph-r1',
	query: 'repair a failed typecheck',
	candidateBucket: 32,
	candidateCount: 2,
	tokenBudget: 1024,
	selectedNodeKeys: ['symbol:one', 'file:two'],
	evidenceRefs: ['source:one', 'diagnostic:two'],
	producerRevision: 'fixture-r1',
}, {
	selectedOrdinalSetChecksum: 'ordinals-r1',
	evidenceRevisions: {
		sourceRevision: 'source-r1',
		representationRevision: 'representation-r1',
		featureRevision: 'feature-r1',
		ontologyRevision: null,
		modelRevision: 'model-r1',
		promptTemplateRevision: 'prompt-r1',
	},
	ordinalMapChecksum: 'ordinal-map-r1',
	retrievalPolicyRevision: 'retrieval-r1',
	acePlaybookRevision: 'playbook-r1',
});

const validOutput = () => ({
	schema: 'atlas.dspy-repair-output.v1',
	contextManifestChecksum: `sha256:${manifest.identityChecksum}`,
	diagnosis: 'Type mismatch at the call site.',
	targetCandidates: ['symbol:one'],
	patchPlan: 'Narrow the parameter type.',
	validationPlan: 'Run the focused typecheck and test.',
	evidenceRefs: ['source:one'],
});

function stubWorker(status: number, body: unknown) {
	vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})));
}

describe('executeDspyLlamaServerRepair via the DSPy worker', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('admits a valid worker output bound to the manifest', async () => {
		stubWorker(200, validOutput());
		const result = await executeDspyLlamaServerRepair({
			manifest,
			options: { workerUrl: 'http://127.0.0.1:8122' },
		});
		expect(result.status).toBe('ADMITTED');
		expect(result.proposal?.targetCandidates).toEqual(['symbol:one']);
		expect(result.canonicalAuthority).toBe(false);
	});

	it('reports an invalid worker output as a validation failure, not a transport outage', async () => {
		stubWorker(200, { ...validOutput(), evidenceRefs: ['source:not-in-manifest'] });
		const result = await executeDspyLlamaServerRepair({
			manifest,
			options: { workerUrl: 'http://127.0.0.1:8122' },
		});
		expect(result.status).toBe('REJECTED_VALIDATION_FAILED');
		expect(result.proposal).toBeNull();
	});

	it('reports a worker 422 as a validation failure', async () => {
		stubWorker(422, { error: 'VALIDATION_FAILED' });
		const result = await executeDspyLlamaServerRepair({
			manifest,
			options: { workerUrl: 'http://127.0.0.1:8122' },
		});
		expect(result.status).toBe('REJECTED_VALIDATION_FAILED');
	});
});
