/**
 * GET /api/admin/qlora — List QLoRA training jobs + available datasets
 * POST /api/admin/qlora — Submit a new QLoRA training job
 *
 * Training infrastructure lives in deeds_labs/ (Python trainers, CUDA kernels).
 * This endpoint manages job metadata and delegates to the training backend.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import { db } from '$lib/server/db/client';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const qloraConfigSchema = z.object({
	epochs: z.number().int().min(1).max(100).optional(),
	batchSize: z.number().int().min(1).max(128).optional(),
	learningRate: z.number().min(1e-6).max(1).optional(),
	loraRank: z.number().int().min(1).max(256).optional(),
	loraAlpha: z.number().int().min(1).max(512).optional(),
	maxSeqLength: z.number().int().min(64).max(32768).optional()
});

const qloraSubmitSchema = z.object({
	model: z.string().max(200).optional().default('gemma4-rotorquant:latest'),
	dataset: z.string().max(200).optional().default('legal-qa-pairs'),
	config: qloraConfigSchema.optional().default({})
});

interface TrainingJob {
	id: string;
	model: string;
	dataset: string;
	status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
	config: {
		epochs: number;
		batchSize: number;
		learningRate: number;
		loraRank: number;
		loraAlpha: number;
		maxSeqLength: number;
	};
	progress: {
		epoch: number;
		step: number;
		loss: number;
		samplesProcessed: number;
	};
	createdAt: string;
	startedAt: string | null;
	completedAt: string | null;
	error: string | null;
}

// In-memory job registry (persisted to Redis)
const JOBS_KEY = 'qlora:jobs';

async function getJobs(): Promise<TrainingJob[]> {
	try {
		const redis: Redis = getRedis();
		const raw = await redis.get(JOBS_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

async function saveJobs(jobs: TrainingJob[]): Promise<void> {
	try {
		const redis: Redis = getRedis();
		await redis.set(JOBS_KEY, JSON.stringify(jobs));
	} catch { /* non-critical */ }
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const jobs = await getJobs();

	// Count available training data files
	let datasetCount = 0;
	try {
		const result = await db.execute(sql`
			SELECT count(*)::int as cnt FROM evidence WHERE status = 'processed' AND content IS NOT NULL
		`);
		const rows = Array.isArray(result) ? result : (result as { rows?: Record<string, any>[] }).rows ?? [];
		datasetCount = rows[0]?.cnt ?? 0;
	} catch { /* DB may be down */ }

	// Available base models from Ollama
	let models: string[] = [];
	try {
		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, {
			signal: AbortSignal.timeout(3000)
		});
		if (res.ok) {
			const data = await res.json();
			models = (data.models ?? []).map((m: Record<string, unknown>) => String(m.name));
		}
	} catch { /* Ollama may be down */ }

	return json({
		jobs: jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
		datasets: {
			evidenceDocuments: datasetCount,
			trainingFiles: [
				{ name: 'legal-qa-pairs', format: 'jsonl', records: 153, description: 'Citation discipline Q&A from fictional cases + canon chunks' },
				{ name: 'case-summaries', format: 'jsonl', records: 306, description: 'Fictional case narrative → structured analysis (153 cases × 2 formats)' },
				{ name: 'statute-analysis', format: 'jsonl', records: 117, description: 'Canon chunk statute/rule plain-language analysis (59 chunks)' }
			]
		},
		availableModels: models,
		defaultConfig: {
			epochs: 3,
			batchSize: 4,
			learningRate: 2e-4,
			loraRank: 16,
			loraAlpha: 32,
			maxSeqLength: 2048
		}
	});
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json();
	const parsed = qloraSubmitSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { model, dataset, config } = parsed.data;

	const job: TrainingJob = {
		id: `qlora-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		model,
		dataset,
		status: 'queued',
		config: {
			epochs: config.epochs ?? 3,
			batchSize: config.batchSize ?? 4,
			learningRate: config.learningRate ?? 2e-4,
			loraRank: config.loraRank ?? 16,
			loraAlpha: config.loraAlpha ?? 32,
			maxSeqLength: config.maxSeqLength ?? 2048
		},
		progress: { epoch: 0, step: 0, loss: 0, samplesProcessed: 0 },
		createdAt: new Date().toISOString(),
		startedAt: null,
		completedAt: null,
		error: null
	};

	const jobs = await getJobs();
	jobs.push(job);
	await saveJobs(jobs);

	return json({
		jobId: job.id,
		status: 'queued',
		message: 'Training job queued. Start the Python training backend to begin processing.'
	}, { status: 201 });
}
