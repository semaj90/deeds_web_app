import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { readOpenSpecTaskReceiptView } from '$lib/server/atlas/openspec-board/task-receipt-view-v1.js';
import { buildOkfDomainClassificationBatchV1 } from '$lib/server/atlas/domain-classification-adapter-v1.js';
import { classifyDomainTaxonomy } from '$lib/server/atlas/domain-taxonomy.js';

const requestSchema = z.object({ taskKey: z.string().trim().min(1).max(512) }).strict();

const proposalSchema = z.object({
	schema: z.literal('atlas.nlp-classification-proposal.v1'),
	producerRevision: z.string().min(1),
	sourceRef: z.string().min(1),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	domain: z.string().min(1),
	ontologyLabels: z.array(z.string()),
	proposalChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	canonicalAuthority: z.literal(false),
	writesPerformed: z.literal(false),
	linkedTupleProposal: z.object({
		status: z.literal('PROPOSAL_ONLY'),
		canonicalAuthority: z.literal(false),
		writesPerformed: z.literal(false)
	}).passthrough()
}).passthrough();

type TaskReceiptView = Awaited<ReturnType<typeof readOpenSpecTaskReceiptView>>;

function taskIdentityFingerprint(view: Extract<TaskReceiptView, { status: 'FOUND' }>) {
	return [
		view.task.revision,
		view.task.checkboxState,
		view.identity.workboardTaskId,
		view.identity.stableKey,
		view.identity.logicalTaskKey,
		view.identity.sourceRef,
		view.identity.sourceFileSha256
	].join('\n');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}
	const parsed = requestSchema.safeParse(raw);
	if (!parsed.success) return json({ error: 'Invalid task key' }, { status: 400 });

	const initial = await readOpenSpecTaskReceiptView(parsed.data.taskKey);
	if (initial.status !== 'FOUND') {
		const status = initial.status === 'NOT_FOUND' ? 404 : initial.status === 'INVALID_KEY' ? 400 : 409;
		return json({ error: 'Task reference is not current', resolution: initial.status }, { status });
	}
	if (initial.task.checkboxState === 'Checked complete') {
		return json({ error: 'Completed tasks are not eligible for classification proposals' }, { status: 409 });
	}
	const sidecarBase = (ENV.NLP_SIDECAR_URL ?? ENV.MINIFORGE_SIDECAR_URL ?? '').trim().replace(/\/+$/, '');
	if (!sidecarBase) return json({ error: 'Classification sidecar is not configured' }, { status: 503 });

	let response: Response;
	try {
		response = await fetch(`${sidecarBase}/classify`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				text: initial.task.text,
				sourceRef: initial.task.sourceRef,
				sourceRevision: initial.identity.sourceFileSha256,
				workspaceRevision: initial.identity.workboardSnapshotSha256,
				sourceNamespace: 'openspec'
			}),
			signal: AbortSignal.timeout(10_000)
		});
	} catch {
		return json({ error: 'Classification sidecar unavailable' }, { status: 502 });
	}
	if (!response.ok) return json({ error: 'Classification sidecar rejected the request' }, { status: 502 });

	let proposal: unknown;
	try {
		proposal = await response.json();
	} catch {
		return json({ error: 'Classification sidecar returned invalid JSON' }, { status: 502 });
	}
	const checkedProposal = proposalSchema.safeParse(proposal);
	if (!checkedProposal.success || checkedProposal.data.sourceRef !== initial.task.sourceRef ||
		checkedProposal.data.sourceRevision !== initial.identity.sourceFileSha256) {
		return json({ error: 'Classification proposal failed source binding validation' }, { status: 502 });
	}

	const current = await readOpenSpecTaskReceiptView(parsed.data.taskKey);
	if (current.status !== 'FOUND' || taskIdentityFingerprint(current) !== taskIdentityFingerprint(initial)) {
		return json({ error: 'Task changed during classification; proposal is stale' }, { status: 409 });
	}
	const domainTupleProposal = buildOkfDomainClassificationBatchV1({
		classification: classifyDomainTaxonomy({
			sourceRef: initial.task.sourceRef,
			title: 'OpenSpec task',
			summary: initial.task.text
		}),
		subjectRef: initial.identity.stableKey,
		subjectKind: 'task',
		sourceRevision: initial.task.revision
	});

	return json({
		status: 'PROPOSAL_ONLY',
		task: {
			workboardTaskId: initial.identity.workboardTaskId,
			stableKey: initial.identity.stableKey,
			logicalTaskKey: initial.identity.logicalTaskKey,
			taskRevision: initial.task.revision,
			sourceRef: initial.task.sourceRef,
			sourceFileSha256: initial.identity.sourceFileSha256,
			workboardSnapshotSha256: initial.identity.workboardSnapshotSha256
		},
		proposal: checkedProposal.data,
		domainTupleProposal,
		canonicalAuthority: false,
		writesPerformed: false
	});
};
