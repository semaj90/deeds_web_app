import { beforeEach, describe, expect, it, vi } from 'vitest';

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('amqplib', () => ({ connect, default: { connect } }));

import { closeRabbitMQ, consumeFromQueue } from './rabbitmq.js';

describe('consumeFromQueue settlement', () => {
	beforeEach(async () => {
		await closeRabbitMQ();
		connect.mockReset();
	});

	it('does not nack after a processor already acknowledged the delivery', async () => {
		const ack = vi.fn();
		const nack = vi.fn();
		let deliver: ((message: { content: Buffer }) => Promise<void>) | undefined;
		const channel = {
			prefetch: vi.fn().mockResolvedValue(undefined),
			assertQueue: vi.fn().mockResolvedValue(undefined),
			consume: vi.fn(async (_queue, callback) => {
				deliver = callback;
				return { consumerTag: 'test-consumer' };
			}),
			ack,
			nack,
			on: vi.fn(),
			close: vi.fn().mockResolvedValue(undefined),
		};
		const connection = {
			createChannel: vi.fn().mockResolvedValue(channel),
			on: vi.fn(),
			close: vi.fn().mockResolvedValue(undefined),
		};
		connect.mockResolvedValue(connection);

		await consumeFromQueue('test.queue', async (_payload, settle) => {
			settle();
			throw new Error('post-ack callback failed');
		});
		await deliver?.({ content: Buffer.from('{}') });

		expect(ack).toHaveBeenCalledOnce();
		expect(nack).not.toHaveBeenCalled();
		await closeRabbitMQ();
	});
});
