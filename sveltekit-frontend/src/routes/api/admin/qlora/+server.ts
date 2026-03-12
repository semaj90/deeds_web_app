/**
 * GET /api/admin/qlora — List QLoRA training jobs + available datasets
 * POST /api/admin/qlora — Submit a new QLoRA training job
 *
 * Training infrastructure lives in deeds_labs/ (Python trainers, CUDA kernels).
 * This endpoint manages job metadata and delegates to the training backend.
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { redis } from '$lib/server/redis.js';
import { db } from '$lib/server/db/client';
import { z } from 'zod';

const qloraConfigSchema = z.object({
	epochs: z.number().int().min(1).max(100).optional(),
	batchSize: z.number().int().min(1).max(128).optional(),
	learningRate: z.number().min(1e-6).max(1).optional(),
	loraRank: z.number().int().min(1).max(256).optional(),
	loraAlpha: z.number().int().min(1).max(512).optional(),
	maxSeqLength: z.number().int().min(64).max(32768).optional()
});

const qloraSubmitSchema = z.object({
	model: z.string().max(200).optional().default('gemma3-legal:latest'),
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
		const raw = await redis.get(JOBS_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

async function saveJobs(jobs: TrainingJob[]): Promise<void> {
	try {
		await redis.set(JOBS_KEY, JSON.stringify(jobs));
	} catch { /* non-critical */ }
}

export async function GET() {
	const jobs = await getJobs();

	// Count available training data files
	let datasetCount = 0;
	try {
		const result = await db.execute(sql`
			SELECT count(*)::int as cnt FROM evidence WHERE status = 'processed' AND content IS NOT NULL
		`);
		const rows = (result as any).rows ?? [...(result as any)];
		datasetCount = rows[0]?.cnt ?? 0;
	} catch { /* DB may be down */ }

	// Available base models from Ollama
	let models: string[] = [];
	try {
		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, {
			signal: AbortSignal.timeout(3000)
		});
		if (res.ok) {
			const data = await res.json();
			models = (data.models ?? []).map((m: any) => m.name);
		}
	} catch { /* Ollama may be down */ }

	return json({
		jobs: jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
		datasets: {
			evidenceDocuments: datasetCount,
			trainingFiles: [
				{ name: 'legal-qa-pairs', format: 'jsonl', description: 'Question-answer pairs from legal corpus' },
				{ name: 'case-summaries', format: 'jsonl', description: 'Case summary generation training data' },
				{ name: 'statute-analysis', format: 'jsonl', description: 'Statute interpretation examples' }
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

export async function POST({ request }: RequestEvent) {
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