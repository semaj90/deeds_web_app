// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const evidenceRow = { id: '123e4567-e89b-42d3-a456-426614174000' };
	const values = vi.fn();
	const returning = vi.fn();
	const execute = vi.fn();
	const insert = vi.fn();
	const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ insert, execute }));
	return {
		evidenceRow,
		values,
		returning,
		execute,
		insert,
		transaction,
		uploadFile: vi.fn(),
		getSeaweedClient: vi.fn(() => ({ presignedGetObject: vi.fn(async () => 'https://example.invalid/preview') })),
		createJob: vi.fn(),
		updateJob: vi.fn(),
		isOutboxAvailable: vi.fn(),
		classify: vi.fn(),
	};
});

vi.mock('$lib/server/db/client.js', () => ({ db: { transaction: mocks.transaction } }));
vi.mock('$lib/server/analysis/analysis-jobs.js', () => ({
	ANALYSIS_JOBS_NOTIFY_CHANNEL: 'atlas_analysis_jobs',
	normalizeAnalysisJobPayload: (payload: unknown) => payload,
}));
vi.mock('$lib/server/seaweed-client.js', () => ({
	uploadSeaweedFile: mocks.uploadFile,
	getSeaweedClient: mocks.getSeaweedClient,
}));
vi.mock('$lib/server/evidence-progress.js', () => ({ createJob: mocks.createJob, updateJob: mocks.updateJob }));
vi.mock('$lib/server/evidence/evidence-vector-outbox-readiness-v1.js', () => ({
	isEvidenceVectorOutboxAvailableV1: mocks.isOutboxAvailable,
}));
vi.mock('$lib/server/ingest/upload-classification-v1.js', () => ({ classifyUploadedBytes: mocks.classify }));
vi.mock('sveltekit-superforms/server', () => ({
	superValidate: vi.fn(async () => ({ valid: true, data: { title: 'Test evidence', description: '', caseId: undefined } })),
}));
vi.mock('sveltekit-superforms/adapters', () => ({ zod4: vi.fn() }));

describe('evidence form upload durable job ownership', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.transaction.mockImplementation(async (callback) => callback({ insert: mocks.insert, execute: mocks.execute }));
		mocks.insert.mockImplementation(() => {
			const callIndex = mocks.insert.mock.calls.length;
			if (callIndex === 1) {
				return { values: vi.fn(() => ({ returning: mocks.returning })) };
			}
			return { values: mocks.values };
		});
		mocks.returning.mockResolvedValue([mocks.evidenceRow]);
		mocks.values.mockResolvedValue(undefined);
		mocks.execute.mockResolvedValue(undefined);
		mocks.uploadFile.mockResolvedValue(undefined);
		mocks.isOutboxAvailable.mockResolvedValue(true);
		mocks.classify.mockReturnValue({
			isQuarantined: false,
			sourceRevision: `sha256:${'a'.repeat(64)}`,
			observedMime: 'application/pdf',
			mimeStatus: 'matched',
			taxonomyGroup: 'legal_document',
			legalEvidenceTypeProposal: 'document',
		});
	});

	async function submitUpload() {
		const formData = new FormData();
		formData.set('title', 'Test evidence');
		formData.set('description', '');
		formData.set('file', new File([new Uint8Array([37, 80, 68, 70])], 'brief.pdf', { type: 'application/pdf' }));
		const request = new Request('http://localhost/evidence', { method: 'POST', body: formData });
		const { actions } = await import('./+page.server.js');
		return actions.upload({ request, locals: { user: { id: '7' } } } as never);
	}

	it('stores the original and queues upload_pipeline in the same transaction', async () => {
		const result = await submitUpload() as Record<string, unknown>;

		expect(result.success).toBe(true);
		expect(mocks.uploadFile).toHaveBeenCalledWith('legal-evidence', expect.stringMatching(/^evidence\/7\//), expect.any(Buffer), expect.any(Object));
		expect(mocks.transaction).toHaveBeenCalledOnce();
		expect(mocks.insert).toHaveBeenCalledTimes(2);
		expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
			evidenceId: mocks.evidenceRow.id,
			jobType: 'upload_pipeline',
			status: 'queued',
		}));
		expect(mocks.execute).toHaveBeenCalledOnce();
	});

	it('does not enqueue a job when the evidence insert returns no row', async () => {
		mocks.returning.mockResolvedValue([]);

		await submitUpload();

		expect(mocks.insert).toHaveBeenCalledOnce();
		expect(mocks.values).not.toHaveBeenCalled();
		expect(mocks.execute).not.toHaveBeenCalled();
	});
});
