// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readTask = vi.hoisted(() => vi.fn());
const sidecarFetch = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/atlas/openspec-board/task-receipt-view-v1.js', () => ({
	readOpenSpecTaskReceiptView: readTask
}));
vi.mock('$lib/server/env.server.js', () => ({
	ENV: { NLP_SIDECAR_URL: 'http://nlp-sidecar.test', MINIFORGE_SIDECAR_URL: undefined }
}));

import { POST } from './+server.js';

const sourceFileSha256 = `sha256:${'b'.repeat(64)}`;
const taskRevision = `sha256:${'a'.repeat(64)}`;

function taskView(revision = taskRevision, checkboxState: 'Open' | 'Partial' | 'Checked complete' = 'Open') {
	return {
		status: 'FOUND' as const,
		task: {
			key: 'crime-scene-reconstruction#task-1',
			text: 'Add a deterministic classification proposal.',
			sourceRef: 'openspec/changes/crime-scene-reconstruction/tasks.md#L12',
			revision,
			checkboxState
		},
		identity: {
			workboardTaskId: 'crime-scene-reconstruction:12',
			stableKey: 'crime-scene-reconstruction#task-1',
			logicalTaskKey: 'crime-scene-reconstruction#task-1',
			sourceRef: 'openspec/changes/crime-scene-reconstruction/tasks.md',
			sourceFileSha256,
			workboardSnapshotSha256: `sha256:${'c'.repeat(64)}`
		},
		current: null,
		staleCount: 0
	};
}

function proposal(sourceRef = 'openspec/changes/crime-scene-reconstruction/tasks.md#L12') {
	return {
		schema: 'atlas.nlp-classification-proposal.v1',
		producerRevision: 'classifier-test-v1',
		sourceRef,
		sourceRevision: sourceFileSha256,
		domain: 'crime-scene-reconstruction',
		ontologyLabels: ['scene.reconstruction'],
		proposalChecksum: `sha256:${'d'.repeat(64)}`,
		canonicalAuthority: false,
		writesPerformed: false,
		linkedTupleProposal: { status: 'PROPOSAL_ONLY', canonicalAuthority: false, writesPerformed: false }
	};
}

function event(body: unknown, user: { id: string } | null = { id: 'user-1' }) {
	return {
		request: new Request('http://localhost/api/atlas/openspec/classify-task', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { user }
	} as Parameters<typeof POST>[0];
}

describe('OpenSpec task classification endpoint', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', sidecarFetch);
	});
	afterEach(() => vi.unstubAllGlobals());

	it('derives classification input from the current workboard and rechecks the revision', async () => {
		readTask.mockResolvedValue(taskView());
		sidecarFetch.mockResolvedValue(new Response(JSON.stringify(proposal()), { status: 200 }));

		const response = await POST(event({ taskKey: 'crime-scene-reconstruction#task-1' }));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(readTask).toHaveBeenCalledTimes(2);
		expect(sidecarFetch).toHaveBeenCalledWith('http://nlp-sidecar.test/classify', expect.objectContaining({ method: 'POST' }));
		const sent = JSON.parse(sidecarFetch.mock.calls[0][1].body);
		expect(sent).toMatchObject({
			text: taskView().task.text,
			sourceRef: taskView().task.sourceRef,
			sourceRevision: sourceFileSha256,
			workspaceRevision: taskView().identity.workboardSnapshotSha256
		});
		expect(payload.task.taskRevision).toBe(taskRevision);
		expect(payload.status).toBe('PROPOSAL_ONLY');
		expect(payload.domainTupleProposal).toMatchObject({
			schema: 'atlas.okf.domain-classification-batch.v1',
			status: 'PROPOSAL_ONLY',
			canonicalAuthority: false,
			writesPerformed: false
		});
		expect(payload.domainTupleProposal.rows[0]).toMatchObject({
			subjectRef: taskView().identity.stableKey,
			subjectKind: 'task',
			sourceRevision: taskRevision,
			evidenceRefs: [taskView().task.sourceRef],
			lifecycle: 'DERIVED'
		});
		expect(payload.canonicalAuthority).toBe(false);
		expect(payload.writesPerformed).toBe(false);
	});

	it('rejects a task that changes while the sidecar is classifying it', async () => {
		readTask.mockResolvedValueOnce(taskView()).mockResolvedValueOnce(taskView(`sha256:${'e'.repeat(64)}`));
		sidecarFetch.mockResolvedValue(new Response(JSON.stringify(proposal()), { status: 200 }));

		const response = await POST(event({ taskKey: 'crime-scene-reconstruction#task-1' }));

		expect(response.status).toBe(409);
		expect((await response.json()).error).toContain('stale');
	});

	it('does not call the sidecar for unauthenticated or completed-task requests', async () => {
		const unauthorized = await POST(event({ taskKey: 'crime-scene-reconstruction#task-1' }, null));
		expect(unauthorized.status).toBe(401);
		expect(readTask).not.toHaveBeenCalled();

		readTask.mockResolvedValue(taskView(taskRevision, 'Checked complete'));
		const completed = await POST(event({ taskKey: 'crime-scene-reconstruction#task-1' }));
		expect(completed.status).toBe(409);
		expect(sidecarFetch).not.toHaveBeenCalled();
	});

	it('rejects sidecar output whose source binding does not match the resolved task', async () => {
		readTask.mockResolvedValue(taskView());
		sidecarFetch.mockResolvedValue(new Response(JSON.stringify(proposal('other/tasks.md#L1')), { status: 200 }));

		const response = await POST(event({ taskKey: 'crime-scene-reconstruction#task-1' }));

		expect(response.status).toBe(502);
		expect((await response.json()).error).toContain('source binding');
		expect(readTask).toHaveBeenCalledTimes(1);
	});
});
