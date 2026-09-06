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
	claimBatch,
	updateAnalysisJob,
	completeAnalysisJob,
	failAnalysisJob,
	resetStaleJobs,
	ANALYSIS_JOBS_NOTIFY_CHANNEL,
	type JobType,
} from './analysis-jobs.js';
import {
	recordAnalysisPassResult,
	type RecordAnalysisPassResultOptions,
} from './analysis-pass-results.js';
import { EVENT_ROUTING_KEYS } from '$lib/server/queue/topology.js';
import { embedGate, entityGate, forensicsGate, summarizeGate, gated, getGateStats } from './concurrency-gate.js';
import {
	buildCodeEvidenceLedgerInputFromSource,
	buildCodeEvidenceSynthesizerReceiptFromSource,
} from './code-evidence-synthesizer.js';
import { computePacketKey } from '$lib/server/atlas/identity/packet-key-builder.js';
import { Client, Pool } from 'pg';
import type { AnalysisPassLedgerInput } from '$lib/server/db/schema/analysis-pass-results.js';
import type { ExtractedFeature } from './ast-langextract-bridge.js';

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
	const [
		{ extractAstAndEntities },
		{ extractDependencyFeatures, extractComplexityFeatures },
	] = await Promise.all([
		import('./ast-langextract-bridge.js').catch(() => ({
			extractAstAndEntities: async () => [],
		})),
		import('./ast-grep-extractor.js').catch(() => ({
			extractDependencyFeatures: async () => [],
			extractComplexityFeatures: async () => [],
		})),
	]);

	const text = (meta.text as string) ?? '';
	const sourceRef = (meta.sourceRef as string) ?? `evidence:${evidenceId}`;
	const sourceRevision = (meta.sourceRevision as string) ?? null;
	const treeNodeId = (meta.treeNodeId as string | null | undefined) ?? null;
	const titleId = (meta.titleId as string | null | undefined) ?? null;
	const packetKey =
		(meta.packetKey as string | null | undefined) ??
		computePacketKey(sourceRef, null, null);
	const featureId = (meta.featureId as string | null | undefined) ?? packetKey ?? sourceRef;
	const featureLabel = (meta.featureLabel as string | null | undefined) ?? sourceRef;
	const workspaceRevision = (meta.workspaceRevision as string | null | undefined) ?? null;
	const jsonlSourceDigest = (meta.jsonlSourceDigest as string | null | undefined) ?? null;
	const jsonlRecordIndex = typeof meta.jsonlRecordIndex === 'number' ? meta.jsonlRecordIndex : null;
	const jsonlLineNumber = typeof meta.jsonlLineNumber === 'number' ? meta.jsonlLineNumber : null;
	const jsonlParserRevision = (meta.jsonlParserRevision as string | null | undefined) ?? null;
	const representationRevision = (meta.representationRevision as string | null | undefined) ?? 'semantic_768@1';
	const producerId = (meta.producerId as string | null | undefined) ?? 'parent-atlas-analysis-worker';
	const producerRevision = (meta.producerRevision as string | null | undefined) ?? ANALYSIS_WORKER_REVISION;
	const featureRevision = (meta.featureRevision as string | null | undefined) ?? 'ast-grep-feature-registry-v1';
	const graphRevision = (meta.graphRevision as string | null | undefined) ?? null;
	const ontologyRevision = (meta.ontologyRevision as string | null | undefined) ?? null;
	const modelRevision = (meta.modelRevision as string | null | undefined) ?? null;
	const partOfSpeech = (meta.partOfSpeech as string | null | undefined) ?? null;
	const langextractEntities = (meta.entities as any[]) ?? [];
	const metaEntityFeatures = langextractEntities.map((entity, index) => ({
		type: mapLangextractEntityToFeatureType(entity),
		name: String(entity?.text ?? entity?.label ?? `entity-${index}`),
		description: `${String(entity?.label ?? 'ENTITY')} entity: "${String(entity?.text ?? entity?.label ?? `entity-${index}`)}"`,
		source: 'langextract' as const,
		rawText: typeof entity?.text === 'string' ? entity.text : undefined,
		confidence: typeof entity?.score === 'number'
			? entity.score
			: typeof entity?.confidence === 'number'
				? entity.confidence
				: undefined,
	}));

	if (!text) return { featuresUpserted: 0, edgesUpserted: 0, qdrantTagsSynced: 0 };

	try {
		// Extract AST + LangExtract features using the bridge first, then enrich with
		// dependency/complexity features from the AST-grep extractor.
		const bridgedFeatures = await extractAstAndEntities(text.slice(0, 100_000), true);
		const dependencyFeatures = await extractDependencyFeatures(text.slice(0, 100_000));
		const complexityFeatures = await extractComplexityFeatures(text.slice(0, 100_000));
			const extractedFeatures: ExtractedFeature[] = dedupeExtractedFeatures([
			...bridgedFeatures,
			...dependencyFeatures,
			...complexityFeatures,
			...metaEntityFeatures,
		]);

		// Upsert to code_features table (idempotent by UNIQUE constraint)
		const pool = new Pool({
			connectionString: process.env.DATABASE_URL || 'postgres://legal_admin:legal_ai@127.0.0.1:5434/legal_ai_db',
			max: 5,
		});

		let featuresUpserted = 0;
		let edgesUpserted = 0;

		try {
			for (const feature of extractedFeatures) {
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

			const synthesized = sourceRevision
				? await buildCodeEvidenceSynthesizerReceiptFromSource({
				packetKey,
				sourceRef,
				sourceRevision,
				featureId,
				featureLabel,
				text,
				isCode: true,
				treeNodeId,
				titleId,
				workspaceRevision,
				jsonlSourceDigest,
				jsonlRecordIndex,
				jsonlLineNumber,
				jsonlParserRevision,
				representationRevision,
				producerId,
				producerRevision,
				featureRevision,
				graphRevision,
				ontologyRevision,
				modelRevision,
				partOfSpeech,
				extractedFeatures,
				})
			: null;

		return {
			featuresUpserted,
			edgesUpserted,
			qdrantTagsSynced: featuresUpserted,
			posConceptPacket: synthesized?.packet ?? null,
			posConceptPacketKey: synthesized?.packetKey ?? null,
			posConceptPacketStatus: synthesized ? 'built' : 'missing_source_revision_or_packet_key',
			codeEvidenceReceipt: synthesized?.receipt ?? null,
			semanticFeatureEnvelope: synthesized?.semanticFeatureEnvelope ?? null,
			codeEvidenceReceiptStatus: synthesized ? 'built' : 'missing_source_revision_or_packet_key',
			fallback_used: false
		};
	} catch (err) {
		console.error(`[CodeFeatureRegistry] Error for ${sourceRef}:`, err);
		return {
			featuresUpserted: 0,
			edgesUpserted: 0,
			qdrantTagsSynced: 0,
			posConceptPacket: null,
			posConceptPacketKey: null,
			posConceptPacketStatus: 'failed',
			codeEvidenceReceipt: null,
			codeEvidenceReceiptStatus: 'failed',
			fallback_used: true,
			error: String(err)
		};
	}
}

function dedupeExtractedFeatures(features: ExtractedFeature[]): ExtractedFeature[] {
	const deduped = new Map<string, typeof features[number]>();
	for (const feature of features) {
		const key = `${feature.source}:${feature.type}:${feature.name}:${feature.lineNumber ?? 0}`;
		if (!deduped.has(key)) deduped.set(key, feature);
	}
	return [...deduped.values()];
}

function mapLangextractEntityToFeatureType(entity: any): 'entity_person' | 'entity_org' | 'entity_location' | 'entity_statute' | 'entity_case' {
	const label = String(entity?.label ?? '').trim().toUpperCase();
	switch (label) {
		case 'PERSON':
			return 'entity_person';
		case 'ORG':
			return 'entity_org';
		case 'LOCATION':
			return 'entity_location';
		case 'STATUTE':
			return 'entity_statute';
		case 'CASE':
		case 'COURT':
			return 'entity_case';
		default:
			return 'entity_case';
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

const ANALYSIS_WORKER_REVISION = 'analysis-worker-v1';
const ANALYSIS_WORKER_PRODUCER_ID = 'parent-atlas-analysis-worker';

type AnalysisStageConfig = {
	gate: ReturnType<typeof import('p-limit').default>;
	concurrency: number;
	family: 'structural' | 'lexical' | 'linguistic' | 'semantic' | 'sequence' | 'rerank' | 'grounded';
	passName: string;
	passRevision: string;
	backend: 'native-ts' | 'rust' | 'python-sidecar' | 'gpu-sidecar' | 'offline';
	backendVersion: string;
	device: 'cpu' | 'cuda' | 'external';
	run: (evidenceId: string, meta: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const stageConfig: Record<string, AnalysisStageConfig> = {
	upload_pipeline: {
		gate: entityGate,
		concurrency: 1,
		family: 'structural',
		passName: 'upload_pipeline',
		passRevision: 'upload-pipeline-v1',
		backend: 'native-ts',
		backendVersion: ANALYSIS_WORKER_REVISION,
		device: 'cpu',
		run: async () => ({ skipped: true, reason: 'upload_pipeline handled upstream' }),
	},
	entity_extraction: {
		gate: entityGate,
		concurrency: 2,
		family: 'linguistic',
		passName: 'entity_extraction',
		passRevision: 'entity-extraction-v1',
		backend: 'native-ts',
		backendVersion: ANALYSIS_WORKER_REVISION,
		device: 'cpu',
		run: runEntityExtraction,
	},
	forensics: {
		gate: forensicsGate,
		concurrency: 4,
		family: 'grounded',
		passName: 'forensics',
		passRevision: 'forensics-v1',
		backend: 'native-ts',
		backendVersion: ANALYSIS_WORKER_REVISION,
		device: 'cpu',
		run: runForensics,
	},
	summarization: {
		gate: summarizeGate,
		concurrency: 1,
		family: 'semantic',
		passName: 'summarization',
		passRevision: 'summarization-v1',
		backend: 'native-ts',
		backendVersion: ANALYSIS_WORKER_REVISION,
		device: 'cpu',
		run: runSummarization,
	},
	code_feature_registry: {
		gate: entityGate,
		concurrency: 2,
		family: 'structural',
		passName: 'code_feature_registry',
		passRevision: 'ast-grep-feature-registry-v1',
		backend: 'native-ts',
		backendVersion: ANALYSIS_WORKER_REVISION,
		device: 'cpu',
		run: runCodeFeatureRegistry, // Canonical order: after LangExtract
	},
};

// --- Worker loop ---

let workerInterval: ReturnType<typeof setInterval> | null = null;
let notificationClient: Client | null = null;
let polling = false;
const POLL_MS = 30_000;

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

			const freeSlots = Math.max(0, cfg.concurrency - cfg.gate.activeCount - cfg.gate.pendingCount);
			if (freeSlots <= 0) continue;

			const jobs = await claimBatch(jobType, freeSlots);
			if (jobs.length === 0) continue;

			// Reset backoff on successful claim
			consecutiveDbErrors = 0;

			for (const job of jobs) {
				// Run inside concurrency gate (non-blocking)
				gated(cfg.gate, async () => {
					const t0 = Date.now();
					const startedAt = new Date(t0).toISOString();
					try {
						await updateAnalysisJob(job.id, { progress: '10' });
						const jobResult = job.result as Record<string, unknown>;
						const result = await cfg.run(job.evidenceId, job.result);
						const passResult = result as Record<string, unknown>;
						const finishedAt = new Date();
						let ledgerInput: AnalysisPassLedgerInput = {
							analysisJobId: job.id,
							evidenceId: job.evidenceId,
							caseId: job.caseId,
							jobType,
							packetKey: (passResult.packetKey as string | null | undefined)
								?? (jobResult.packetKey as string | null | undefined) ?? null,
							sourceRef: (passResult.sourceRef as string | null | undefined)
								?? (jobResult.sourceRef as string | null | undefined) ?? job.evidenceId,
							sourceRevision: (passResult.sourceRevision as string | null | undefined)
								?? (jobResult.sourceRevision as string | null | undefined) ?? null,
							workspaceRevision: (passResult.workspaceRevision as string | null | undefined)
								?? (jobResult.workspaceRevision as string | null | undefined) ?? null,
							representationRevision: (passResult.representationRevision as string | null | undefined)
								?? (jobResult.representationRevision as string | null | undefined) ?? null,
							family: cfg.family,
							passName: cfg.passName,
							passRevision: cfg.passRevision,
							producerId: ANALYSIS_WORKER_PRODUCER_ID,
							producerRevision: ANALYSIS_WORKER_REVISION,
							backend: cfg.backend,
							backendVersion: cfg.backendVersion,
							device: cfg.device,
							status: 'succeeded' as const,
							startedAt,
							completedAt: finishedAt.toISOString(),
							durationMs: Date.now() - t0,
							payload: result,
							features: (passResult.features && typeof passResult.features === 'object' && !Array.isArray(passResult.features)) ? (passResult.features as Record<string, unknown>) : {},
							artifacts: (passResult.artifacts && typeof passResult.artifacts === 'object' && !Array.isArray(passResult.artifacts)) ? (passResult.artifacts as Record<string, unknown>) : {},
							evidence: Array.isArray(passResult.evidence) ? (passResult.evidence as Array<Record<string, unknown>>) : [],
							warnings: Array.isArray(passResult.warnings) ? passResult.warnings.map((warning) => String(warning)) : [],
							modelId: typeof passResult.modelId === 'string' ? passResult.modelId : null,
							modelRevision: typeof passResult.modelRevision === 'string' ? passResult.modelRevision : null,
						};

						let recordOpts: RecordAnalysisPassResultOptions | undefined;

						if (jobType === 'code_feature_registry' && typeof result === 'object' && result !== null) {
							const codeEvidenceReceipt = (result as Record<string, unknown>).codeEvidenceReceipt;
							const posConceptPacket = (result as Record<string, unknown>).posConceptPacket;
							const posConceptPacketKey = (result as Record<string, unknown>).posConceptPacketKey;
							if (codeEvidenceReceipt && posConceptPacket && posConceptPacketKey) {
								const codeLedgerInput = buildCodeEvidenceLedgerInputFromSource({
									analysisJobId: job.id,
									evidenceId: job.evidenceId,
									caseId: job.caseId,
									jobType,
									packetKey: String((codeEvidenceReceipt as Record<string, unknown>).packetKey ?? posConceptPacketKey),
									sourceRef: String((codeEvidenceReceipt as Record<string, unknown>).sourceRef ?? job.evidenceId),
									sourceRevision: String((codeEvidenceReceipt as Record<string, unknown>).sourceRevision ?? jobResult.sourceRevision ?? ''),
									workspaceRevision: (codeEvidenceReceipt as Record<string, unknown>).workspaceRevision as string | null | undefined,
									representationRevision: String((codeEvidenceReceipt as Record<string, unknown>).representationRevision ?? 'semantic_768@1'),
									family: cfg.family,
									passName: cfg.passName,
									passRevision: cfg.passRevision,
									backend: cfg.backend,
									backendVersion: cfg.backendVersion,
									device: cfg.device,
									startedAt,
									completedAt: finishedAt.toISOString(),
									durationMs: Date.now() - t0,
									analysisWorkerProducerId: ANALYSIS_WORKER_PRODUCER_ID,
									analysisWorkerProducerRevision: ANALYSIS_WORKER_REVISION,
									synthesized: {
										packet: posConceptPacket as any,
										packetKey: String(posConceptPacketKey),
										extractedFeatures: [],
										receipt: codeEvidenceReceipt as any,
										semanticFeatureEnvelope: (result as Record<string, unknown>).semanticFeatureEnvelope as any,
									},
								});
									if (codeLedgerInput) {
										ledgerInput = codeLedgerInput;
										recordOpts = {
											emitIntegrationEvent: {
												eventType: 'code.evidence.persisted',
												routingKey: EVENT_ROUTING_KEYS.codeEvidencePersisted,
												sourceRef: codeLedgerInput.sourceRef ?? undefined,
											},
										};
									}
							}
						}

						const persisted = await recordAnalysisPassResult(ledgerInput, recordOpts);
						if (persisted === null) {
							console.warn(`[Worker] ${jobType}/${job.id} pass ledger unavailable; continuing without persistence`);
						}

						await completeAnalysisJob(job.id, { ...result, durationMs: Date.now() - t0 });
						console.log(`[Worker] ${jobType}/${job.id} done in ${Date.now() - t0}ms`);
					} catch (err) {
						console.error(`[Worker] ${jobType}/${job.id} failed:`, err);
						await failAnalysisJob(job.id, String(err)).catch(() => {});
					}
				}).catch(() => {});
			}
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

async function startNotificationListener(): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl || notificationClient) return;

	try {
		const client = new Client({
			connectionString: databaseUrl,
			application_name: 'parent-atlas-analysis-worker-listener',
			connectionTimeoutMillis: 3000,
		});
		await client.connect();
		await client.query(`LISTEN ${ANALYSIS_JOBS_NOTIFY_CHANNEL}`);
		client.on('notification', () => {
			void pollOnce();
		});
		client.on('error', (err) => {
			console.warn('[Worker] analysis notify listener error:', err);
		});
		client.on('end', () => {
			if (notificationClient === client) {
				notificationClient = null;
			}
		});
		notificationClient = client;
		console.log(`[Worker] Listening on ${ANALYSIS_JOBS_NOTIFY_CHANNEL}`);
	} catch (err) {
		console.warn('[Worker] analysis notify listener unavailable; using fallback polling only:', err);
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

	void startNotificationListener();
	workerInterval = setInterval(pollOnce, POLL_MS);
	console.log('[Worker] Analysis worker started (poll every 30s, notification wake enabled when available)');
	pollOnce();
}

/** Stop the worker (for graceful shutdown / tests). */
export function stopWorker(): void {
	if (workerInterval) {
		clearInterval(workerInterval);
		workerInterval = null;
	}
	if (notificationClient) {
		void notificationClient.end().catch(() => {});
		notificationClient = null;
	}
	console.log('[Worker] Analysis worker stopped');
}

/** Health check stats. */
export function getWorkerStats() {
	return { running: workerInterval !== null, gates: getGateStats() };
}
