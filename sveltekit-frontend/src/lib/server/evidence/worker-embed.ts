#!/usr/bin/env node
import { consume } from './rabbitmq.js';
import { embedText } from './services/embedding.js';
import { upsertEmbedding } from '$lib/server/features/evidence/services/drizzle-stub.js';

const EMBED_QUEUE = 'evidence.embed';

async function start(): Promise<void> {
	console.log('Starting Embed worker - listening on', EMBED_QUEUE);

	await consume(EMBED_QUEUE, async (job) => {
		const { evidenceId, text } = job as { evidenceId: string; text?: string };
		console.log('Embed job', evidenceId);

		const vector = await embedText(text ?? '');
		await upsertEmbedding(evidenceId, vector, {
			textSnippet: (text ?? '').slice(0, 200),
		});
	});
}

start().catch((err) => {
	console.error(err);
	process.exit(1);
});
