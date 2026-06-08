import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
// @ts-expect-error TODO(TS-101): NATS package types are missing StringCodec export
import { connect, StringCodec } from 'nats';
import { createHash } from 'crypto';
import { ENV } from '$lib/server/env.server.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sc = (StringCodec as any)();

const jobSchema = z.object({
	documentId: z.string().uuid(),
	caseId: z.string().uuid(),
	sourceRef: z.string().max(500),
	path: z.string().max(1000).optional().default(''),
	text: z.string().min(1).max(500_000),
	embeddingModel: z.string().max(100).optional().default('embeddinggemma:latest'),
	collection: z.string().max(100).optional().default('codebase_chunks_768'),
	priority: z.number().int().min(1).max(10).optional().default(5),
});

/** POST /api/indexing/queue — enqueue a document for async indexing via NATS → go-index-worker */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => null);
	const parsed = jobSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const data = parsed.data;
	const jobId = crypto.randomUUID();
	const contentHash = createHash('sha256').update(data.text).digest('hex');

	const job = {
		jobId,
		userId: locals.user.id,
		documentId: data.documentId,
		caseId: data.caseId,
		sourceRef: data.sourceRef,
		path: data.path,
		text: data.text,
		contentHash,
		embeddingModel: data.embeddingModel,
		collection: data.collection,
		priority: data.priority,
	};

	let nc;
	try {
		nc = await connect({ servers: ENV.NATS_URL, timeout: 3000 });
		nc.publish('index.document.created', sc.encode(JSON.stringify(job)));
		await nc.flush();
	} catch (err) {
		console.error('[indexing/queue] NATS publish failed:', err);
		return json({ error: 'Queue unavailable' }, { status: 503 });
	} finally {
		await nc?.drain();
	}

	return json({ jobId, contentHash, status: 'queued' }, { status: 202 });
};

/** GET /api/indexing/queue/status?jobId=… — poll Valkey for job progress */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const jobId = url.searchParams.get('jobId');
	if (!jobId) return json({ error: 'jobId required' }, { status: 400 });

	const workerBase = ENV.INDEX_WORKER_URL ?? 'http://127.0.0.1:8101';
	try {
		const res = await fetch(`${workerBase}/status/${encodeURIComponent(jobId)}`, {
			signal: AbortSignal.timeout(3000),
		});
		if (!res.ok) return json({ jobId, stage: 'unknown', progress: 0 });
		return json(await res.json());
	} catch {
		return json({ jobId, stage: 'unknown', progress: 0 });
	}
};
