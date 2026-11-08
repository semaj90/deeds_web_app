import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db, pgRows } from '$lib/server/db/client.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { getRedis } from '$lib/server/redis.js';
import {
	LLAMA_SERVER_BASE_URL,
	getActiveLocalVlmModel,
	getLlamaSessionDescriptor
} from '$lib/server/ai/local-llama-provider.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UiSnapshotSchema = z
	.object({
		pathname: z.string().max(400).default('/'),
		pageTitle: z.string().max(300).optional().default(''),
		headings: z.array(z.string().max(240)).max(24).optional().default([]),
		cards: z.array(z.string().max(320)).max(24).optional().default([]),
		activeControls: z.array(z.string().max(180)).max(30).optional().default([]),
		metrics: z.array(z.string().max(200)).max(24).optional().default([]),
		selectedText: z.string().max(2000).optional().default(''),
		viewport: z
			.object({
				width: z.number().int().min(100).max(10000),
				height: z.number().int().min(100).max(10000)
			})
			.optional()
	})
	.optional();

const ScreenAnalysisPostSchema = z.object({
	mode: z.enum(['screen', 'chat']).default('chat'),
	message: z.string().trim().min(1).max(16000),
	caseId: z.string().max(120).nullable().optional().default(null),
	currentRoute: z.string().max(400).optional().default('/'),
	imageBase64: z.string().max(6_000_000).nullable().optional().default(null),
	uiSnapshot: UiSnapshotSchema,
	history: z
		.array(
			z.object({
				role: z.enum(['user', 'assistant']),
				content: z.string().max(12000)
			})
		)
		.max(16)
		.optional()
		.default([])
});

async function probeLlamaProps(): Promise<{ healthy: boolean; vision: boolean }> {
	const rootUrl = LLAMA_SERVER_BASE_URL.replace(/\/v1\/?$/, '');
	try {
		const [healthRes, propsRes] = await Promise.all([
			fetch(`${rootUrl}/health`, { signal: AbortSignal.timeout(2200) }).catch(() => null),
			fetch(`${rootUrl}/props`, { signal: AbortSignal.timeout(2200) }).catch(() => null)
		]);
		const healthy = Boolean(healthRes?.ok);
		if (!propsRes?.ok) return { healthy, vision: false };
		const propsData = (await propsRes.json()) as { modalities?: { vision?: boolean } };
		return {
			healthy: true,
			vision: propsData?.modalities?.vision === true
		};
	} catch {
		return { healthy: false, vision: false };
	}
}

function stripThinkingBlocks(raw: string): string {
	return raw
		.replace(/<think>[\s\S]*?<\/think>/gi, '')
		.replace(/^\s+|\s+$/g, '');
}

function normalizeImageDataUri(raw: string): string {
	if (raw.startsWith('data:image/')) return raw;
	return `data:image/jpeg;base64,${raw}`;
}

function extractLegalKeywords(text: string): string[] {
	const lexicon = [
		'evidence',
		'exhibit',
		'statute',
		'citation',
		'jurisdiction',
		'precedent',
		'discovery',
		'motion',
		'brief',
		'custody',
		'admissibility',
		'holding',
		'liability',
		'counsel',
		'docket'
	];
	const lower = text.toLowerCase();
	return lexicon.filter((term) => lower.includes(term)).slice(0, 6);
}

/**
 * GET /api/ai/screen-analysis
 * Stable JSON contract reporting live Ornith (:8090) model & VLM vision readiness.
 */
export const GET: RequestHandler = async () => {
	const fallback = {
		ok: false,
		endpoint: ':8090',
		model: 'ornith-1.5-9b',
		healthy: false,
		visionProjectorLoaded: false,
		mode: 'offline' as 'vlm-multimodal' | 'ornith-dom-recon' | 'offline',
		timestamp: new Date().toISOString()
	};

	try {
		const [descriptor, props] = await Promise.all([
			getLlamaSessionDescriptor(true, 2500),
			probeLlamaProps()
		]);
		const healthy = descriptor.healthy || props.healthy;
		return json({
			ok: healthy,
			endpoint: ':8090',
			model: descriptor.modelId,
			healthy,
			visionProjectorLoaded: props.vision,
			mode: !healthy ? 'offline' : props.vision ? 'vlm-multimodal' : 'ornith-dom-recon',
			timestamp: new Date().toISOString()
		});
	} catch {
		return json(fallback);
	}
};

/**
 * POST /api/ai/screen-analysis
 * Contextual Legal Chat + Screen VLM Analysis backed by Ornith on llama-server :8090.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const devBypass = process.env.DEV_BYPASS_AUTH === 'true';
	if (!locals.user && !devBypass) {
		return json({ ok: false, error: 'Unauthorized', answer: '' }, { status: 401 });
	}

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return json({ ok: false, error: 'Invalid JSON payload', answer: '' }, { status: 400 });
	}

	const parsed = ScreenAnalysisPostSchema.safeParse(rawBody);
	if (!parsed.success) {
		return json(
			{
				ok: false,
				error: parsed.error.issues[0]?.message ?? 'Invalid request payload',
				answer: ''
			},
			{ status: 400 }
		);
	}

	const { mode, message, caseId, currentRoute, imageBase64, uiSnapshot, history } = parsed.data;
	const t0 = Date.now();
	if (caseId) {
		if (!UUID_RE.test(caseId)) {
			return json({ ok: false, error: 'Invalid case ID format', answer: '' }, { status: 400 });
		}
		const actorId = Number(locals.user?.id);
		if (!Number.isInteger(actorId) || actorId <= 0) {
			return json({ ok: false, error: 'Case not found', answer: '' }, { status: 404 });
		}
		try {
			const authorizedCase = await getAuthorizedCase(caseId, actorId);
			if (!authorizedCase) {
				return json({ ok: false, error: 'Case not found', answer: '' }, { status: 404 });
			}
		} catch {
			return json({ ok: false, error: 'Unable to verify case access', answer: '' }, { status: 503 });
		}
	}

	// 1. Canonical PostgreSQL 18 case + exhibit context
	let caseContextSummary = '';
	let sourceRef = `route:${currentRoute || '/'}`;
	if (caseId && UUID_RE.test(caseId)) {
		sourceRef = `case:${caseId}`;
		try {
			const [caseRes, evRes] = await Promise.all([
				db.execute(sql`
					SELECT title, status, jurisdiction, court, LEFT(COALESCE(description, ''), 600) AS summary
					FROM cases
					WHERE id = ${caseId}::uuid
					LIMIT 1
				`),
				db.execute(sql`
					SELECT COALESCE(title, file_name, 'Exhibit') AS label, evidence_type
					FROM evidence
					WHERE case_id = ${caseId}::uuid
					ORDER BY created_at DESC NULLS LAST
					LIMIT 6
				`)
			]);

			const cRow = pgRows(caseRes)[0] as Record<string, unknown> | undefined;
			const eRows = pgRows(evRes) as Array<Record<string, unknown>>;
			if (cRow) {
				caseContextSummary =
					`Committed PG18 Case Dossier (${caseId.slice(0, 8)}): "${cRow.title ?? 'Untitled'}"` +
					` | Status: ${cRow.status ?? 'open'}` +
					(cRow.jurisdiction ? ` | Jurisdiction: ${cRow.jurisdiction}` : '') +
					(cRow.court ? ` | Court: ${cRow.court}` : '') +
					(cRow.summary ? `\nCase Summary: ${cRow.summary}` : '');
				if (eRows.length > 0) {
					caseContextSummary += `\nLogged Exhibits (${eRows.length}): ${eRows
						.map((e) => `${e.label} [${e.evidence_type ?? 'doc'}]`)
						.join(', ')}`;
				} else {
					caseContextSummary += `\nLogged Exhibits: 0 exhibits currently attached.`;
				}
			} else {
				return json({ ok: false, error: 'Case not found', answer: '' }, { status: 404 });
			}
		} catch {
			return json({ ok: false, error: 'Unable to load authorized case context', answer: '' }, { status: 503 });
		}
	}

	// 2. Assemble UI / Screen Reconnaissance telemetry
	const reconLines: string[] = [`Active Route: ${uiSnapshot?.pathname || currentRoute || '/'}`];
	if (uiSnapshot?.viewport) {
		reconLines.push(`Viewport: ${uiSnapshot.viewport.width}x${uiSnapshot.viewport.height}`);
	}
	if (uiSnapshot?.headings?.length) {
		reconLines.push(`Visible Headings: ${uiSnapshot.headings.slice(0, 10).join(' | ')}`);
	}
	if (uiSnapshot?.cards?.length) {
		reconLines.push(`Visible Dossier Cards/Sections: ${uiSnapshot.cards.slice(0, 10).join(' ;; ')}`);
	}
	if (uiSnapshot?.metrics?.length) {
		reconLines.push(`Telemetry Readouts: ${uiSnapshot.metrics.slice(0, 10).join(' | ')}`);
	}
	if (uiSnapshot?.activeControls?.length) {
		reconLines.push(`Interactive Toolbar/Controls: ${uiSnapshot.activeControls.slice(0, 14).join(', ')}`);
	}
	if (uiSnapshot?.selectedText) {
		reconLines.push(`User Highlighted Text: "${uiSnapshot.selectedText}"`);
	}
	if (caseContextSummary) {
		reconLines.push(caseContextSummary);
	}

	const contextBlob = reconLines.join('\n');

	// 3. ACE Context Editor Gate Canonical Packet (transient Redis injection, no hidden thoughts/tensors)
	const runId = `screen_${Date.now().toString(36)}`;
	const acePacket = {
		sourceRef,
		ConceptID: mode === 'screen' ? 'vlm_screen_reconnaissance' : 'contextual_legal_counsel',
		ContextBlob: contextBlob.slice(0, 3600)
	};

	try {
		const redis = getRedis();
		if (redis) {
			await redis.set(`ace:packet:${runId}`, JSON.stringify(acePacket), 'EX', 300).catch(() => {});
		}
	} catch {
		// non-fatal transient packet write
	}

	// 4. Probe live Ornith (:8090) model & vision modality
	const [model, props] = await Promise.all([
		getActiveLocalVlmModel(true),
		probeLlamaProps()
	]);

	const useMultimodalVision = Boolean(props.vision && imageBase64);
	const modality: 'vlm-vision' | 'ornith-screen-recon' | 'ornith-contextual-chat' = useMultimodalVision
		? 'vlm-vision'
		: mode === 'screen'
			? 'ornith-screen-recon'
			: 'ornith-contextual-chat';

	const systemPrompt =
		mode === 'screen'
			? `You are YoRHa Legal Counsel powered by Ornith (:8090). Analyze the user's live legal application screen concisely using crisp markdown bullets (**Posture**, **Visible Telemetry & Gaps**, **Recommended Next Actions**). Distinguish visible observations from conclusions, and do not claim source verification unless specific source references are provided.${useMultimodalVision ? ' Consider the attached screen frame as user-provided context.' : ''} Keep response under 220 words.`
			: `You are YoRHa Contextual Legal Counsel powered by Ornith (:8090). Use the supplied context snapshot carefully, distinguish general guidance from case-specific facts, and do not claim source verification unless specific source references are provided. Use concise markdown headings or bullets where helpful. Keep response under 260 words.\n\n[CONTEXT SNAPSHOT]\n${acePacket.ContextBlob}`;

	const priorMessages = history.slice(-8).map((turn) => ({
		role: turn.role,
		content: turn.content
	}));

	const userText =
		mode === 'screen'
			? `${message}\n\n[ACE SCREEN CONTEXT PACKET]\n${acePacket.ContextBlob}`
			: message;

	const finalUserContent = useMultimodalVision && imageBase64
		? [
				{ type: 'text', text: userText },
				{ type: 'image_url', image_url: { url: normalizeImageDataUri(imageBase64) } }
			]
		: userText;

	try {
		const llmRes = await fetch(`${LLAMA_SERVER_BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages: [
					{ role: 'system', content: systemPrompt },
					...priorMessages,
					{ role: 'user', content: finalUserContent }
				],
				stream: false,
				temperature: 0.35,
				max_tokens: 520,
				chat_template_kwargs: { enable_thinking: false }
			}),
			signal: AbortSignal.timeout(45_000)
		});

		if (!llmRes.ok) {
			const errText = await llmRes.text().catch(() => '');
			return json(
				{
					ok: false,
					error: `Ornith (:8090) returned HTTP ${llmRes.status}${errText ? `: ${errText.slice(0, 120)}` : ''}`,
					answer: '',
					model,
					modality,
					acePacket
				},
				{ status: 502 }
			);
		}

		const data = (await llmRes.json()) as {
			model?: string;
			choices?: Array<{ message?: { content?: string } }>;
		};

		const rawContent = String(data.choices?.[0]?.message?.content ?? '');
		const answer = stripThinkingBlocks(rawContent) || 'Analysis complete — no additional findings reported.';
		const latencyMs = Date.now() - t0;

		return json({
			ok: true,
			answer,
			model: data.model || model,
			modality,
			visionProjectorLoaded: props.vision,
			latencyMs,
			keywords: extractLegalKeywords(answer),
			suggestions:
				mode === 'screen'
					? [
							'Draft a quick intake checklist for this dossier',
							'What statutes or exhibits should I link first?',
							'Summarize visible risks on this screen'
						]
					: [
							'Analyze current screen state',
							'Identify missing chain-of-custody elements',
							'Outline a motion brief from this case'
						],
			acePacket: {
				sourceRef: acePacket.sourceRef,
				ConceptID: acePacket.ConceptID
			}
		});
	} catch (err) {
		return json(
			{
				ok: false,
				error: err instanceof Error ? err.message : 'Ornith (:8090) connection timed out',
				answer: '',
				model,
				modality,
				acePacket: {
					sourceRef: acePacket.sourceRef,
					ConceptID: acePacket.ConceptID
				}
			},
			{ status: 503 }
		);
	}
};
