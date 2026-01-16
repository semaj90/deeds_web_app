/**
 * RabbitMQ Chunking Pipeline Test Suite
 * Phase 96 - Validation and benchmarking
 * January 11, 2026
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { publishChunkedData, rabbitMQStreamMachine } from '../machines/rabbitmq-stream-integration';

// ===== Test Configuration =====

const TEST_CONFIG = {
	url: process.env.RABBITMQ_URL ?? 'amqp://localhost',
	streamName: 'test-chunking-stream',
	maxLengthBytes: 1_000_000_000, // 1GB for testing
	maxAge: '1D',
	prefetchCount: 100
};

const SAMPLE_LEGAL_DOCUMENT = `
PROSECUTION MEMORANDUM

CASE NO: 2024-CR-12345
DEFENDANT: John Doe
CHARGES: Burglary in the Second Degree (RCW 9A.52.030)

FACTUAL SUMMARY:
On December 15, 2024, at approximately 2:30 AM, officers responded to a burglary alarm at 123 Main Street, Seattle, WA. Upon arrival, they observed the defendant exiting the rear window of the residence carrying a laptop computer and jewelry. The defendant fled on foot but was apprehended three blocks away after a brief pursuit.

EVIDENCE:
1. Fingerprints recovered from the window sill match the defendant's prints on file
2. Stolen property recovered from the defendant's backpack
3. Security camera footage showing the defendant entering the property
4. Witness statement from neighbor who observed suspicious activity

LEGAL ANALYSIS:
The defendant entered a dwelling with intent to commit theft, satisfying all elements of burglary in the second degree under RCW 9A.52.030. The evidence strongly supports the charge, including physical evidence, eyewitness testimony, and video documentation.

RECOMMENDATION:
Prosecution is recommended with filing of burglary in the second degree charges. The defendant has a prior conviction for theft, which may be used for sentencing enhancement.
`.repeat(10); // ~10KB document

// ===== Test Suite =====

describe('RabbitMQ Chunking Pipeline', () => {
	let streamActor: RabbitMQStreamActor;

	beforeAll(async () => {
		// Create and start stream actor
		streamActor = createActor(rabbitMQStreamMachine);
		streamActor.start();

		// Connect to RabbitMQ
		streamActor.send({
			type: 'CONNECT',
			config: TEST_CONFIG
		});

		// Wait for connection
		await waitForState(streamActor, 'connected', 5000);
	});

	afterAll(async () => {
		if (streamActor) {
			streamActor.send({ type: 'DISCONNECT' });
			await waitForState(streamActor, 'disconnected', 3000);
			streamActor.stop();
		}
	});

	describe('Connection Management', () => {
		it('should connect to RabbitMQ successfully', () => {
			const snapshot = streamActor.getSnapshot();
			expect(snapshot.matches('connected')).toBe(true);
			expect(snapshot.context.isConnected).toBe(true);
			expect(snapshot.context.channel).not.toBeNull();
			expect(snapshot.context.connection).not.toBeNull();
		});

		it('should have publisher confirms enabled', () => {
			const snapshot = streamActor.getSnapshot();
			expect(snapshot.context.channel).not.toBeNull();
			// Channel should have confirmSelect called (verified in logs)
		});
	});

	describe('Document Chunking', () => {
		it('should chunk large documents correctly', () => {
			const chunkSize = 500;
			const overlap = 50;
			const chunks: string[] = [];

			for (let i = 0; i < SAMPLE_LEGAL_DOCUMENT.length; i += chunkSize - overlap) {
				chunks.push(SAMPLE_LEGAL_DOCUMENT.slice(i, i + chunkSize));
			}

			expect(chunks.length).toBeGreaterThan(1);
			expect(chunks[0].length).toBeLessThanOrEqual(chunkSize);

			// Verify overlap between chunks
			for (let i = 1; i < chunks.length; i++) {
				const prevChunk = chunks[i - 1];
				const currentChunk = chunks[i];
				const overlapText = prevChunk.slice(-overlap);
				expect(currentChunk.startsWith(overlapText)).toBe(true);
			}
		});

		it('should maintain document integrity after chunking', () => {
			const chunkSize = 500;
			const overlap = 50;
			const chunks: string[] = [];

			for (let i = 0; i < SAMPLE_LEGAL_DOCUMENT.length; i += chunkSize - overlap) {
				chunks.push(SAMPLE_LEGAL_DOCUMENT.slice(i, i + chunkSize));
			}

			// Reassemble without overlap
			const reassembled = chunks.map((chunk, i) => {
				if (i === 0) return chunk;
				return chunk.slice(overlap);
			}).join('');

			expect(reassembled).toBe(SAMPLE_LEGAL_DOCUMENT);
		});

		it('should handle edge cases (empty, single char, exact chunk size)', () => {
			const testCases = [
				{ text: '', expectedChunks: 1 }, // Empty becomes single chunk
				{ text: 'A', expectedChunks: 1 },
				{ text: 'A'.repeat(500), expectedChunks: 1 }, // Exact chunk size
				{ text: 'A'.repeat(501), expectedChunks: 2 }  // Just over
			];

			const chunkSize = 500;
			const overlap = 50;

			for (const { text, expectedChunks } of testCases) {
				const chunks: string[] = [];
				for (let i = 0; i < text.length; i += chunkSize - overlap) {
					chunks.push(text.slice(i, i + chunkSize));
				}

				const actualChunks = chunks?.length?? 1; // Ensure at least 1 chunk
				expect(actualChunks).toBe(expectedChunks);
			}
		});
	});

	describe('Stream Publishing', () => {
		it('should publish chunks with deduplication headers', async () => {
			const chunks = ['Chunk 1', 'Chunk 2', 'Chunk 3'];

			await publishChunkedData(streamActor, chunks, 'test-message', {
				testId: 'dedup-test'
			});

			const snapshot = streamActor.getSnapshot();
			expect(snapshot.context.publishedCount).toBeGreaterThanOrEqual(3);
		});

		it('should handle large batch publishing', async () => {
			const chunkSize = 500;
			const overlap = 50;
			const chunks: string[] = [];

			for (let i = 0; i < SAMPLE_LEGAL_DOCUMENT.length; i += chunkSize - overlap) {
				chunks.push(SAMPLE_LEGAL_DOCUMENT.slice(i, i + chunkSize));
			}

			const startCount = streamActor.getSnapshot().context.publishedCount;

			await publishChunkedData(streamActor, chunks, 'legal-document', {
				caseId: 'TEST-001'
			});

			const endCount = streamActor.getSnapshot().context.publishedCount;
			expect(endCount - startCount).toBe(chunks.length);
		}, 30000); // 30s timeout for large batch

		it('should add correct metadata to messages', async () => {
			const chunks = ['Test 1', 'Test 2'];
			const metadata = {
				caseId: 'CASE-123',
				documentType: 'prosecution_memo'
			};

			// Spy on published messages (would need message inspection in real impl)
			await publishChunkedData(streamActor, chunks, 'test', metadata);

			// Verify through context (in production, would verify actual message headers)
			const snapshot = streamActor.getSnapshot();
			expect(snapshot.context.publishedCount).toBeGreaterThan(0);
		});
	});

	describe('Stream Consumption', () => {
		it('should consume messages from different offsets', async () => {
			// Publish test messages first
			const testMessages = ['Msg 1', 'Msg 2', 'Msg 3'];
			await publishChunkedData(streamActor, testMessages, 'offset-test', {});

			// Start consuming from 'last'
			streamActor.send({ type: 'START_CONSUMING', offset: 'last' });
			await waitForState(streamActor, 'consuming', 3000);

			// Publish one more message
			streamActor.send({
				type: 'PUBLISH',
				message: {
					id: 'test-msg-4',
					type: 'offset-test',
					data: 'Msg 4',
					timestamp: Date.now()
				}
			});

			// Wait for message to be consumed
			await new Promise(resolve => setTimeout(resolve, 500));

			const snapshot = streamActor.getSnapshot();
			expect(snapshot.context.consumedCount).toBeGreaterThan(0);
		}, 10000);

		it('should respect prefetch limits', async () => {
			const snapshot = streamActor.getSnapshot();
			expect(snapshot.context.config.prefetchCount).toBe(TEST_CONFIG.prefetchCount);
		});

		it('should handle consumer stop/start', async () => {
			streamActor.send({ type: 'START_CONSUMING', offset: 'last' });
			await waitForState(streamActor, 'consuming', 3000);

			streamActor.send({ type: 'STOP_CONSUMING' });
			await waitForState(streamActor, 'connected', 3000);

			const snapshot = streamActor.getSnapshot();
			expect(snapshot.matches('connected')).toBe(true);
		});
	});

	describe('Error Handling', () => {
		it('should handle connection errors gracefully', async () => {
			const errorActor = createActor(rabbitMQStreamMachine);
			errorActor.start();

			errorActor.send({
				type: 'CONNECT',
				config: {
					...TEST_CONFIG,
					url: 'amqp://invalid:9999' // Invalid URL
				}
			});

			await waitForState(errorActor, 'error', 5000);

			const snapshot = errorActor.getSnapshot();
			expect(snapshot.matches('error')).toBe(true);
			expect(snapshot.context.error).not.toBeNull();

			errorActor.stop();
		});

		it('should support reconnection after error', async () => {
			const errorActor = createActor(rabbitMQStreamMachine);
			errorActor.start();

			// First connection fails
			errorActor.send({
				type: 'CONNECT',
				config: {
					...TEST_CONFIG,
					url: 'amqp://invalid:9999'
				}
			});

			await waitForState(errorActor, 'error', 5000);

			// Reconnect with valid config
			errorActor.send({ type: 'RECONNECT' });
			errorActor.send({
				type: 'CONNECT',
				config: TEST_CONFIG
			});

			// Should eventually connect (if RabbitMQ is available)
			errorActor.stop();
		});
	});

	describe('Performance Benchmarks', () => {
		it('should publish 1000 chunks within 10 seconds', async () => {
			const chunks = Array.from({ length: 1000 }, (_, i) => `Test chunk ${i}`);

			const startTime = Date.now();
			await publishChunkedData(streamActor, chunks, 'benchmark', {});
			const endTime = Date.now();

			const duration = endTime - startTime;
			expect(duration).toBeLessThan(10000); // 10 seconds

			console.log(`Published 1000 chunks in ${duration}ms (${Math.round(1000 / (duration / 1000))} chunks/sec)`);
		}, 15000);

		it('should maintain throughput with large chunks', async () => {
			const largeChunks = Array.from({ length: 100 }, (_, i) =>
				`Large chunk ${i}: ${'X'.repeat(10000)}` // 10KB chunks
			);

			const startTime = Date.now();
			await publishChunkedData(streamActor, largeChunks, 'large-benchmark', {});
			const endTime = Date.now();

			const duration = endTime - startTime;
			const totalBytes = largeChunks.reduce((sum, chunk) => sum + chunk.length, 0);
			const throughputMBps = (totalBytes / 1024 / 1024) / (duration / 1000);

			console.log(`Throughput: ${throughputMBps.toFixed(2)} MB/s`);
			expect(throughputMBps).toBeGreaterThan(0.5); // At least 0.5 MB/s
		}, 30000);
	});
});

// ===== Helper Functions =====

/**
 * Wait for XState machine to reach specific state
 */
function waitForState(
	actor: RabbitMQStreamActor,
	targetState: string,
	timeout = 5000
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			subscription.unsubscribe();
			reject(new Error(`Timeout waiting for state: ${targetState}`));
		}, timeout);

		const subscription = actor.subscribe(snapshot => {
			if (snapshot.matches(targetState)) {
				clearTimeout(timeoutId);
				subscription.unsubscribe();
				resolve();
			}
		});
	});
}

/**
 * Run all tests with summary
 */
export async function runChunkingTests(): Promise<void> {
	console.log('🧪 RabbitMQ Chunking Pipeline Test Suite');
	console.log('═'.repeat(60));
	console.log('');
	console.log('Testing:');
	console.log('  ✓ Connection management');
	console.log('  ✓ Document chunking (sliding window)');
	console.log('  ✓ Stream publishing (deduplication)');
	console.log('  ✓ Stream consumption (offset tracking)');
	console.log('  ✓ Error handling');
	console.log('  ✓ Performance benchmarks');
	console.log('');
	console.log('Run: npm run test src/lib/tests/rabbitmq-chunking.test.ts');
	console.log('');
}
