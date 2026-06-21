import { pgRows } from '$lib/server/db/client';
/**
 * Evidence Analysis Pipeline
 *
 * Orchestrates: YOLO detection → Redis cache → LLM escalation (gemma4-rotorquant:latest)
 * → graph connection creation → Drizzle analysis cache persist → Qdrant tag update
 *
 * Called from evidence upload route (step 6b) and RabbitMQ evidence.process handler.
 */

import crypto from 'crypto';
import { sql } from 'drizzle-orm';
import type { YOLOResult } from '$lib/server/yolo.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AnalysisPipelineInput {
	evidenceId: string;
	caseId?: string;
	fileName: string;
	buffer: Buffer;
	existingText?: string;
}

export interface LLMSynthesis {
	summary: string;
	keyFindings: string[];
	caseRelevance: string;
	suggestedConnections: Array<{ targetType: string; reason: string; confidence: number }>;
	escalationReason: string;
	triples?: Array<{ subject: string; predicate: string; object: string; context?: string }>;
}

export interface AnalysisPipelineResult {
	yolo: YOLOResult | null;
	yoloCacheHit: boolean;
	llmSynthesis: LLMSynthesis | null;
	llmEscalated: boolean;
	graphConnectionsCreated: number;
	cachedToDb: boolean;
	tags: string[];
	processingTimeMs: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const YOLO_CACHE_PREFIX = 'yolo:evidence:';
const YOLO_CACHE_TTL_S = 7 * 24 * 60 * 60; // 7 days
const LLM_ESCALATION_THRESHOLD = 3; // escalate if ≥3 YOLO objects detected
const LLM_ESCALATION_TYPES = new Set([
	'signature',
	'stamp',
	'handwriting',
	'table',
	'figure',
	'chart',
	'photograph',
	'seal',
	'watermark',
]);
const ANALYSIS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Main Pipeline ──────────────────────────────────────────────────────────

export async function runEvidenceAnalysisPipeline(
	input: AnalysisPipelineInput
): Promise<AnalysisPipelineResult> {
	const start = performance.now();
	const hash = crypto.createHash('sha256').update(input.buffer).digest('hex');

	let yoloResult: YOLOResult | null = null;
	let yoloCacheHit = false;
	let llmSynthesis: LLMSynthesis | null = null;
	let llmEscalated = false;
	let graphConnectionsCreated = 0;
	let cachedToDb = false;
	const tags: string[] = [];

	// ── Stage 1: YOLO with Redis cache ───────────────────────────────────

	try {
		const cached = await getYoloCache(hash);
		if (cached) {
			yoloResult = cached;
			yoloCacheHit = true;
			console.log(`[AnalysisPipeline] YOLO cache HIT for ${input.fileName} (${hash.slice(0, 8)})`);
		} else {
			const { createYOLOService } = await import('$lib/server/yolo.js');
			const yolo = createYOLOService();
			if (await yolo.isModelAvailable()) {
				yoloResult = await yolo.analyzeDocument(input.buffer, input.fileName);
				await setYoloCache(hash, yoloResult);
				console.log(
					`[AnalysisPipeline] YOLO: ${yoloResult.objects.length} objects, ${yoloResult.layout.regions.length} regions (${yoloResult.processingTime}ms)`
				);
			}
		}
	} catch (err) {
		console.warn('[AnalysisPipeline] YOLO stage failed (non-fatal):', err);
	}

	// Collect tags from YOLO
	if (yoloResult) {
		for (const obj of yoloResult.objects) {
			tags.push(`detected:${obj.class}`);
		}
		for (const region of yoloResult.layout.regions) {
			tags.push(`layout:${region.type}`);
		}
	}

	// ── Stage 2: LLM escalation check ────────────────────────────────────

	const shouldEscalate = checkLLMEscalation(yoloResult, input.existingText);

	if (shouldEscalate) {
		llmEscalated = true;
		try {
			const { synthesizeHolisticDocument } = await import('$lib/server/analysis/holistic-synthesizer.js');
			if (input.existingText && input.existingText.length > 2000) {
				const holistic = await synthesizeHolisticDocument(input.existingText);
				if (holistic) {
					llmSynthesis = {
						summary: holistic.globalSummary,
						keyFindings: holistic.keyTakeaways,
						caseRelevance: 'Derived from holistic document analysis',
						suggestedConnections: holistic.triples.map(t => ({
							targetType: t.object,
							reason: `${t.subject} ${t.predicate} ${t.object}`,
							confidence: 0.9
						})),
						escalationReason: 'Holistic long-context synthesis triggered',
						triples: holistic.triples
					};
				}
			}
			
			if (!llmSynthesis) {
				llmSynthesis = await synthesizeWithLLM(input, yoloResult, tags);
			}
			if (llmSynthesis) {
				tags.push('llm:synthesized');
				for (const finding of llmSynthesis.keyFindings) {
					tags.push(`finding:${finding.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`);
				}
				console.log(
					`[AnalysisPipeline] LLM synthesis: ${llmSynthesis.keyFindings.length} findings, relevance: ${llmSynthesis.caseRelevance.slice(0, 60)}`
				);
			}
		} catch (err) {
			console.warn('[AnalysisPipeline] LLM synthesis failed (non-fatal):', err);
		}
	}

	// ── Stage 3: Graph connections for case relevance ─────────────────────

	if (input.caseId && yoloResult && yoloResult.objects.length > 0) {
		try {
			graphConnectionsCreated = await createGraphConnections(
				input.evidenceId,
				input.caseId,
				yoloResult,
				llmSynthesis
			);
			console.log(
				`[AnalysisPipeline] Created ${graphConnectionsCreated} graph connections for case ${input.caseId}`
			);
		} catch (err) {
			console.warn('[AnalysisPipeline] Graph connection creation failed (non-fatal):', err);
		}
	}

	// ── Stage 4: Persist to Drizzle analysis cache ───────────────────────

	try {
		cachedToDb = await persistAnalysisCache(input, yoloResult, llmSynthesis, tags, start);
	} catch (err) {
		console.warn('[AnalysisPipeline] DB cache persist failed (non-fatal):', err);
	}

	return {
		yolo: yoloResult,
		yoloCacheHit,
		llmSynthesis,
		llmEscalated,
		graphConnectionsCreated,
		cachedToDb,
		tags,
		processingTimeMs: Math.round(performance.now() - start),
	};
}

// ── Redis YOLO Cache ───────────────────────────────────────────────────────

async function getYoloCache(hash: string): Promise<YOLOResult | null> {
  try {
    const { getFromRedisCache } = await import('$lib/server/cache.js');
    return await getFromRedisCache<YOLOResult>(`${YOLO_CACHE_PREFIX}${hash}`);
  } catch {
    return null;
  }
}

async function setYoloCache(hash: string, result: YOLOResult): Promise<void> {
  try {
    const { redis } = await import('$lib/server/redis.js');
    await redis.set(`${YOLO_CACHE_PREFIX}${hash}`, JSON.stringify(result), 'EX', YOLO_CACHE_TTL_S);
  } catch {
    // Redis unavailable — non-fatal
  }
}

// ── LLM Escalation Logic ──────────────────────────────────────────────────

function checkLLMEscalation(yolo: YOLOResult | null, text?: string): boolean {
  if (!yolo) return false;

  // Escalate if enough objects detected
  if (yolo.objects.length >= LLM_ESCALATION_THRESHOLD) return true;

  // Escalate if specific legal-significant types found
  const hasSignificantType =
    yolo.objects.some((o) => LLM_ESCALATION_TYPES.has(o.class)) ||
    yolo.layout.regions.some((r) => LLM_ESCALATION_TYPES.has(r.type));
  if (hasSignificantType) return true;

  // Escalate if layout is complex (many distinct region types)
  const regionTypes = new Set(yolo.layout.regions.map((r) => r.type));
  if (regionTypes.size >= 4) return true;

  // Escalate if existing text is short but image is complex
  if (text && text.length < 200 && yolo.objects.length > 0) return true;

  return false;
}

async function synthesizeWithLLM(
  input: AnalysisPipelineInput,
  yolo: YOLOResult | null,
  tags: string[]
): Promise<LLMSynthesis | null> {
  const { ollamaFetch } = await import('$lib/server/ollama.js');
  const { ENV } = await import('$lib/server/env.server.js');
  const { getOllamaEndpoint } = await import('$lib/server/utils/ollama-endpoint.js');

  // Check Redis for cached synthesis
  const synthCacheKey = `llm_synthesis:${input.evidenceId}`;
  try {
    const { getFromRedisCache } = await import('$lib/server/cache.js');
    const cached = await getFromRedisCache<LLMSynthesis>(synthCacheKey);
    if (cached) return cached;
  } catch {
    /* miss */
  }

  const objectSummary =
    yolo?.objects.map((o) => `${o.class} (${(o.confidence * 100).toFixed(0)}%)`).join(', ') ??
    'none';
  const layoutSummary = yolo?.layout.regions.map((r) => `${r.type} region`).join(', ') ?? 'none';
  const textContext = input.existingText?.slice(0, 2000) || '(no extracted text available)';

  const prompt = `You are a legal evidence analyst. Analyze this document evidence and provide structured findings.

## Evidence: ${input.fileName}
## Detected Objects: ${objectSummary}
## Document Layout: ${layoutSummary}
## Extracted Text (first 2000 chars): ${textContext}
## Tags: ${tags.join(', ')}

Respond with ONLY valid JSON (no markdown):
{
  "summary": "2-3 sentence summary of what this evidence contains",
  "keyFindings": ["finding 1", "finding 2", ...],
  "caseRelevance": "How this evidence might be relevant to a legal case",
  "suggestedConnections": [{"targetType": "type of related evidence", "reason": "why connected", "confidence": 0.8}],
  "escalationReason": "Why this evidence needed deeper analysis"
}`;

  try {
    const res = await ollamaFetch(`${getOllamaEndpoint()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-rotorquant:latest',
        prompt,
        stream: false,
        options: { temperature: 0.3, num_predict: 800 },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const responseText = data.response?.trim();
    if (!responseText) return null;

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = responseText.replace(/^```json?\n?|\n?```$/g, '').trim();
    const synthesis: LLMSynthesis = JSON.parse(jsonStr);

    // Cache the synthesis result
    try {
      const { redis } = await import('$lib/server/redis.js');
      await redis.set(synthCacheKey, JSON.stringify(synthesis), 'EX', 24 * 60 * 60);
    } catch {
      /* non-fatal */
    }

    return synthesis;
  } catch (err) {
    console.warn('[AnalysisPipeline] LLM synthesis parse/fetch failed:', err);
    return null;
  }
}

// ── Graph Connection Creation ──────────────────────────────────────────────

async function createGraphConnections(
	evidenceId: string,
	caseId: string,
	yolo: YOLOResult,
	synthesis: LLMSynthesis | null
): Promise<number> {
	const { db } = await import('$lib/server/db/client');
	let created = 0;

	// Find sibling evidence in same case that shares detected object types
	const objectClasses = [...new Set(yolo.objects.map((o) => o.class))];
	if (objectClasses.length === 0) return 0;

	// Query existing evidence nodes for this case
	const siblings = await db.execute(
		sql`SELECT id, title, ai_tags
			FROM yorha_evidence_nodes
			WHERE case_id = ${caseId}
			AND id != ${evidenceId}
			AND status = 'active'
			LIMIT 20`
	);

	const siblingRows = pgRows(siblings) ?? [];

	for (const sibling of siblingRows) {
		const siblingTags: string[] = Array.isArray(sibling.ai_tags)
			? sibling.ai_tags
			: [];
		// Check if sibling shares any detected object types
		const shared = objectClasses.filter((cls) =>
			siblingTags.some((t: string) => t.includes(cls))
		);

		if (shared.length > 0) {
			const strength = Math.min(100, shared.length * 25);
			const confidence = Math.round(
				yolo.objects
					.filter((o) => shared.includes(o.class))
					.reduce((sum, o) => sum + o.confidence, 0) / shared.length * 100
			);

			await db.execute(
				sql`INSERT INTO yorha_evidence_connections (case_id, source_node_id, target_node_id, connection_type, strength, confidence_score, description, created_by)
					VALUES (
						${caseId},
						${evidenceId},
						${sibling.id},
						'shared_detection',
						${strength},
						${confidence},
						${`Shared objects: ${shared.join(', ')}`},
						${evidenceId}
					)
					ON CONFLICT DO NOTHING`
			);
			created++;
		}
	}

	// Add LLM-suggested connections
	if (synthesis?.suggestedConnections) {
		for (const conn of synthesis.suggestedConnections) {
			if (conn.confidence < 0.5) continue;
			// Find matching sibling by type or name
			const match = siblingRows.find((s: any) => {
				const tags: string[] = Array.isArray(s.ai_tags) ? s.ai_tags : [];
				const title = String(s.title ?? '').toLowerCase();
				const target = conn.targetType.toLowerCase();
				return tags.some((t: string) => t.toLowerCase().includes(target)) || title.includes(target);
			});
			if (match) {
				await db.execute(
					sql`INSERT INTO yorha_evidence_connections (case_id, source_node_id, target_node_id, connection_type, strength, confidence_score, ai_reasoning, created_by)
						VALUES (
							${caseId},
							${evidenceId},
							${match.id},
							'llm_suggested',
							${Math.round(conn.confidence * 100)},
							${Math.round(conn.confidence * 100)},
							${conn.reason},
							${evidenceId}
						)
						ON CONFLICT DO NOTHING`
				);
				created++;
			}
		}
	}

	// Persist triples to Neo4j via sidecar if available
	if (synthesis?.triples && synthesis.triples.length > 0) {
		try {
			const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
			const driver = getNeo4jDriver();
			const session = driver.session();
			for (const t of synthesis.triples) {
				await session.run(
					`MATCH (e:Evidence {id: $evidenceId})
					 MERGE (s:Entity {name: $subject})
					 MERGE (o:Entity {name: $object})
					 MERGE (s)-[r:RELATION {type: $predicate}]->(o)
					 SET r.evidenceId = $evidenceId, r.context = $context
					 MERGE (e)-[:MENTIONS]->(s)
					 MERGE (e)-[:MENTIONS]->(o)`,
					{
						evidenceId,
						subject: t.subject,
						predicate: t.predicate.replace(/\s+/g, '_').toUpperCase(),
						object: t.object,
						context: t.context ?? ''
					}
				);
			}
			await session.close();
		} catch (err) {
			console.warn('[AnalysisPipeline] Neo4j triple sync failed:', err);
		}
	}

	return created;
}

// ── Drizzle Analysis Cache Persist ─────────────────────────────────────────

async function persistAnalysisCache(
	input: AnalysisPipelineInput,
	yolo: YOLOResult | null,
	synthesis: LLMSynthesis | null,
	tags: string[],
	startTime: number
): Promise<boolean> {
	const { db } = await import('$lib/server/db/client');

	const analysisType = synthesis ? 'combined' : yolo ? 'yolo' : 'none';
	if (analysisType === 'none') return false;

	const result = {
		yolo: yolo
			? {
				objects: yolo.objects,
				layout: yolo.layout,
				modelType: yolo.modelType,
				processingTime: yolo.processingTime,
			}
			: null,
		synthesis: synthesis ?? null,
	};

	const confidence = synthesis
		? 0.85
		: yolo
			? yolo.objects.reduce((sum, o) => sum + o.confidence, 0) / Math.max(1, yolo.objects.length)
			: 0;

	const processingTimeMs = Math.round(performance.now() - startTime);
	const expiresAt = new Date(Date.now() + ANALYSIS_CACHE_TTL_MS);

	// Embed result summary for semantic search
	let embedding: number[] | null = null;
	const summaryText = synthesis?.summary
		?? yolo?.objects.map((o) => o.class).join(', ')
		?? '';

	if (summaryText.length > 10) {
		try {
			const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
			embedding = await generateSingleEmbedding(summaryText.slice(0, 512));
		} catch { /* non-fatal */ }
	}

	await db.execute(
		sql`INSERT INTO evidence_analysis_cache
			(evidence_id, case_id, analysis_type, result, result_embedding, confidence, object_count, tags, llm_escalated, processing_time_ms, expires_at)
			VALUES (
				${input.evidenceId},
				${input.caseId ?? null},
				${analysisType},
				${JSON.stringify(result)}::jsonb,
				${embedding ? sql`${JSON.stringify(embedding)}::vector` : sql`NULL`},
				${confidence},
				${yolo?.objects.length ?? 0},
				${JSON.stringify(tags)}::jsonb,
				${synthesis !== null},
				${processingTimeMs},
				${expiresAt.toISOString()}::timestamptz
			)
			ON CONFLICT DO NOTHING`
	);

	return true;
}
