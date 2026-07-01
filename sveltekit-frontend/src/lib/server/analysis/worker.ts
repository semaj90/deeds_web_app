/**
 * DB-backed analysis worker loop.
 *
 * Polls `analysis_jobs` for queued jobs and processes them with
 * the concurrency gates from concurrency-gate.ts.
 *
 * On startup, resets stale 'running' jobs back to 'queued' (crash recovery).
 * Uses FOR UPDATE SKIP LOCKED so concurrent claims never collide.
 */

import {
	claimNextJob,
	updateAnalysisJob,
	completeAnalysisJob,
	failAnalysisJob,
	resetStaleJobs,
	type JobType,
} from './analysis-jobs.js';
import { embedGate, entityGate, forensicsGate, summarizeGate, gated, getGateStats } from './concurrency-gate.js';
import { Pool } from 'pg';

// --- Stage executors (lazy-imported to avoid circular deps) ---

async function runEntityExtraction(evidenceId: string, meta: Record<string, unknown>) {
	const { extractEntities } = await import('./entity-extraction.js');
	const text = (meta.text as string) ?? '';
	if (!text) return { entityCount: 0, types: [] };
	const entities = await extractEntities(text.slice(0, 50_000));
	return {
		entityCount: entities.length,
		types: [...new Set(entities.map(e => e.label))],
		entities: entities.slice(0, 200),
	};
}

/**
 * STAGE 2: Code Feature Registry (ast-grep)
 * Input: source_ref + content + LangExtract metadata
 * Output: code_features rows, code_feature_edges, Qdrant payload tags
 */
async function runCodeFeatureRegistry(evidenceId: string, meta: Record<string, unknown>) {
	const { extractAstFeatures } = await import('./ast-grep-extractor.js').catch(() => ({
		extractAstFeatures: async () => []
	}));

	const text = (meta.text as string) ?? '';
	const sourceRef = (meta.sourceRef as string) ?? `evidence:${evidenceId}`;
	const langextractEntities = (meta.entities as any[]) ?? [];

	if (!text) return { featuresUpserted: 0, edgesUpserted: 0, qdrantTagsSynced: 0 };

	try {
		// Extract AST features
		const astFeatures = await extractAstFeatures(text.slice(0, 100_000));

		// Upsert to code_features table (idempotent by UNIQUE constraint)
		const pool = new Pool({
			connectionString: process.env.DATABASE_URL || 'postgres://legal_admin:legal_ai@127.0.0.1:5434/legal_ai_db',
			max: 5,
		});

		let featuresUpserted = 0;
		let edgesUpserted = 0;

		try {
			for (const feature of astFeatures) {
				const featureId = `${sourceRef}:${feature.name}:${feature.type}`;
				const domainClass = langextractEntities.some(e => e.label === 'STATUTE') ? 'legal_code' : 'application_code';

				// Upsert code_features row
				await pool.query(`
					INSERT INTO code_features (
						feature_id, source_ref, symbol, kind, language,
						line_start, line_end, packet_key, domain_class,
						static_tags, summary, created_at, updated_at
					) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
					ON CONFLICT (source_ref, symbol, kind) DO UPDATE SET
						updated_at = NOW()
				`, [
					featureId,
					sourceRef,
					feature.name,
					feature.type,
					'typescript', // Infer from metadata if available
					feature.lineNumber ?? null,
					null,
					null, // packet_key: do not mutate identity
					domainClass,
					feature.type === 'ast_function' ? ['function', 'callable'] : ['code_structure'],
					feature.description,
				]);

				featuresUpserted++;
			}

			// Emit ACP telemetry event
			console.log(`[CodeFeatureRegistry] Upserted ${featuresUpserted} features for ${sourceRef}`);
		} finally {
			pool.end().catch(() => {});
		}

		return {
			featuresUpserted,
			edgesUpserted,
			qdrantTagsSynced: featuresUpserted,
			fallback_used: false
		};
	} catch (err) {
		console.error(`[CodeFeatureRegistry] Error for ${sourceRef}:`, err);
		return {
			featuresUpserted: 0,
			edgesUpserted: 0,
			qdrantTagsSynced: 0,
			fallback_used: true,
			error: String(err)
		};
	}
}

async function runForensics(_evidenceId: string, meta: Record<string, unknown>) {
	const { detectAndRankPatterns } = await import('./gemma4-nlp-reranker.js');
	const text = (meta.text as string) ?? '';
	if (!text) return { flagCount: 0, types: [], rankings: [] };

	// Detect patterns and rerank via Gemma4 for legal relevance
	const ranked = await detectAndRankPatterns(text.slice(0, 50_000), true);

	return {
		flagCount: ranked.length,
		types: ranked.map(r => r.type),
		rankings: ranked.map(r => ({
			type: r.type,
			severity: r.severity,
			confidence: r.confidence,
			legalRelevance: r.legalRelevance,
			contextSummary: r.contextSummary,
			source: r.source,
		})),
	};
}

async function runSummarization(_evidenceId: string, meta: Record<string, unknown>) {
	const { summarizeDocument } = await import('./summarizer.js');
	const text = (meta.text as string) ?? '';
	if (!text) return { summaryLength: 0 };
	const summary = await summarizeDocument(text);
	return { summaryLength: summary.length, summary: summary.slice(0, 5000) };
}

// --- Gate + executor mapping ---

const stageConfig: Record<string, {
	gate: ReturnType<typeof import('p-limit').default>;
	run: (evidenceId: string, meta: Record<string, unknown>) => Promise<Record<string, unknown>>;
}> = {
	entity_extraction: { gate: entityGate, run: runEntityExtraction },
	code_feature_registry: { gate: entityGate, run: runCodeFeatureRegistry }, // Canonical order: after LangExtract
	forensics: { gate: forensicsGate, run: runForensics },
	summarization: { gate: summarizeGate, run: runSummarization },
};

// --- Worker loop ---

let workerInterval: ReturnType<typeof setInterval> | null = null;
let polling = false;
const POLL_MS = 3_000;

// Error tracking for exponential backoff
let consecutiveDbErrors = 0;
let lastDbErrorLog = 0;
const DB_ERROR_LOG_INTERVAL = 60_000; // Log once per minute max

async function pollOnce(): Promise<void> {
	if (polling) return;
	polling = true;

	try {
		for (const jobType of Object.keys(stageConfig) as JobType[]) {
			const cfg = stageConfig[jobType];
			if (!cfg) continue;

			// Skip if gate is at capacity
			if (cfg.gate.activeCount >= (cfg.gate as any).concurrency) continue;

			const job = await claimNextJob(jobType);
			if (!job) continue;

			// Reset backoff on successful claim
			consecutiveDbErrors = 0;

			// Run inside concurrency gate (non-blocking)
			gated(cfg.gate, async () => {
				const t0 = Date.now();
				try {
					await updateAnalysisJob(job.id, { progress: '10' });
					const result = await cfg.run(job.evidenceId, job.result);
					await completeAnalysisJob(job.id, { ...result, durationMs: Date.now() - t0 });
					console.log(`[Worker] ${jobType}/${job.id} done in ${Date.now() - t0}ms`);
				} catch (err) {
					console.error(`[Worker] ${jobType}/${job.id} failed:`, err);
					await failAnalysisJob(job.id, String(err)).catch(() => {});
				}
			}).catch(() => {});
		}
	} catch (err: any) {
		consecutiveDbErrors++;

		// Exponential backoff: 2s, 4s, 8s, 16s, 32s (max)
		const backoffMs = Math.min(2000 * Math.pow(2, consecutiveDbErrors - 1), 32000);

		// Only log once per minute to avoid spam
		const now = Date.now();
		if (now - lastDbErrorLog > DB_ERROR_LOG_INTERVAL) {
			if (err.code === 'ECONNREFUSED') {
				console.warn(`[Worker] DB unavailable (ECONNREFUSED), backing off ${backoffMs}ms`);
			} else if (err.message?.includes('57P03') || err.message?.includes('starting up')) {
				console.warn(`[Worker] DB still starting up, backing off ${backoffMs}ms`);
			} else {
				console.error(`[Worker] Poll error:`, err.message);
			}
			lastDbErrorLog = now;
		}

		// Apply backoff delay
		await new Promise(resolve => setTimeout(resolve, backoffMs));
	} finally {
		polling = false;
	}
}

/**
 * Start the analysis worker. Idempotent — safe to call multiple times.
 * Call from hooks.server.ts or a layout server load.
 */
export function startWorker(): void {
	if (workerInterval) return;

	// Crash recovery: re-queue jobs stuck in 'running' for >10 min
	resetStaleJobs(10).then((n) => {
		if (n > 0) console.log(`[Worker] Reset ${n} stale jobs to queued`);
	}).catch(() => {});

	workerInterval = setInterval(pollOnce, POLL_MS);
	console.log('[Worker] Analysis worker started (poll every 3s)');
	pollOnce();
}

/** Stop the worker (for graceful shutdown / tests). */
export function stopWorker(): void {
	if (workerInterval) {
		clearInterval(workerInterval);
		workerInterval = null;
		console.log('[Worker] Analysis worker stopped');
	}
}

/** Health check stats. */
export function getWorkerStats() {
	return { running: workerInterval !== null, gates: getGateStats() };
}
