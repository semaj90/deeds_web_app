import { describe, expect, it, vi } from 'vitest';
import { handleLibraryDocumentParseDeliveryV1 } from './library-document-parse-consumer-v1.js';

const jobId = '01932000-0000-4000-8000-000000000001';
const documentId = '01932000-0000-4000-8000-000000000002';
const revisionId = '01932000-0000-4000-8000-000000000003';

function delivery(commandType = 'document.parse') {
	return {
		content: Buffer.from(JSON.stringify({
			command: {
				commandId: '01932000-0000-4000-8000-000000000004',
				commandType,
				issuedAt: '2026-11-13T00:00:00.000Z',
				requestId: '01932000-0000-4000-8000-000000000005',
				runId: '01932000-0000-4000-8000-000000000006',
				taskId: jobId,
				capability: 'library.document.parse',
				targetWorkerClass: 'library-ingestion-worker',
				attempt: 0,
				timeoutMs: 1_800_000,
				idempotencyKey: 'idempotency',
			},
			payload: { jobId, documentId, sourceSha256: 'a'.repeat(64), documentRevision: revisionId, caseId: null },
		})),
	};
}

function channel() {
	return { ack: vi.fn(), nack: vi.fn() };
}

describe('library document.parse RabbitMQ consumer contract', () => {
	it('validates the command and hands the exact job payload to the idempotent worker', async () => {
		const ch = channel();
		const processTask = vi.fn(async () => undefined);
		const msg = delivery();

		await handleLibraryDocumentParseDeliveryV1(ch, msg, processTask);

		expect(processTask).toHaveBeenCalledWith({
			jobId, documentId, sourceSha256: 'a'.repeat(64), documentRevision: revisionId, caseId: null,
		});
		expect(ch.ack).toHaveBeenCalledWith(msg);
		expect(ch.nack).not.toHaveBeenCalled();
	});

	it('rejects a command type mismatch without invoking the worker', async () => {
		const ch = channel();
		const processTask = vi.fn(async () => undefined);
		const msg = delivery('agent.execute');

		await handleLibraryDocumentParseDeliveryV1(ch, msg, processTask);

		expect(processTask).not.toHaveBeenCalled();
		expect(ch.nack).toHaveBeenCalledWith(msg, false, false);
	});

	it('rejects a task routed to a different capability or worker class', async () => {
		const ch = channel();
		const processTask = vi.fn(async () => undefined);
		const msg = delivery();
		const envelope = JSON.parse(msg.content.toString('utf8'));
		envelope.command.targetWorkerClass = 'generic-document-worker';
		msg.content = Buffer.from(JSON.stringify(envelope));

		await handleLibraryDocumentParseDeliveryV1(ch, msg, processTask);

		expect(processTask).not.toHaveBeenCalled();
		expect(ch.nack).toHaveBeenCalledWith(msg, false, false);
	});

	it('requeues transient worker failures for at-least-once delivery', async () => {
		const ch = channel();
		const processTask = vi.fn(async () => { throw new Error('database temporarily unavailable'); });
		const msg = delivery();

		await handleLibraryDocumentParseDeliveryV1(ch, msg, processTask);

		expect(ch.ack).not.toHaveBeenCalled();
		expect(ch.nack).toHaveBeenCalledWith(msg, false, true);
	});

	it('dead-letters malformed JSON without calling the worker', async () => {
		const ch = channel();
		const processTask = vi.fn(async () => undefined);
		const msg = { content: Buffer.from('{') };

		await handleLibraryDocumentParseDeliveryV1(ch, msg, processTask);

		expect(processTask).not.toHaveBeenCalled();
		expect(ch.nack).toHaveBeenCalledWith(msg, false, false);
	});
});
