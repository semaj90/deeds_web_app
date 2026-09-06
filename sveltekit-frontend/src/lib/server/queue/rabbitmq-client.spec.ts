import { describe, expect, it, vi } from 'vitest';

const { publishMock, traceQueueMock } = vi.hoisted(() => ({
	publishMock: vi.fn(),
	traceQueueMock: vi.fn(async (_operation: string, _queue: string, _metadata: unknown, callback: () => Promise<unknown>) => callback()),
}));

vi.mock('$lib/server/observability/langfuse.js', () => ({ traceQueue: traceQueueMock }));
vi.mock('./rabbitmq-manager-fixed.js', () => ({
	rabbitmq: { channel: { publish: publishMock } },
}));

import { EXCHANGES } from './topology.js';
import {
	AUTHORITATIVE_TASK_PUBLISH_ERROR,
	assertConveniencePublishTarget,
	publishMessage,
} from './rabbitmq-client.js';

describe('RabbitMQ convenience publisher boundary', () => {
  it('rejects direct publish to the canonical durable task exchange', () => {
    expect(() => assertConveniencePublishTarget(EXCHANGES.tasks)).toThrow(
      AUTHORITATIVE_TASK_PUBLISH_ERROR,
    );
  });

	it('still allows non-authoritative notification and legacy exchanges', () => {
		expect(() => assertConveniencePublishTarget(EXCHANGES.events)).not.toThrow();
		expect(() => assertConveniencePublishTarget('analytics.events')).not.toThrow();
		expect(() => assertConveniencePublishTarget('vector.updates')).not.toThrow();
	});

	it('records the exact UTF-8 payload size at direct channel delivery', async () => {
		const payload = {
			documentId: 'doc-utf8',
			text: 'Evidence — café — 日本語',
			collection: 'legal_documents',
		};

		const result = await publishMessage('document.processing', 'document.embed', payload);

		expect(result).toEqual({ ok: true });
		expect(publishMock).toHaveBeenCalledOnce();
		expect(traceQueueMock).toHaveBeenCalledOnce();
		const metadata = traceQueueMock.mock.calls[0]?.[2] as Record<string, unknown>;
		expect(metadata).toMatchObject({
			exchange: 'document.processing',
			payloadBytes: Buffer.byteLength(JSON.stringify(payload), 'utf8'),
			payloadEncoding: 'json-utf8',
		});
	});
});
