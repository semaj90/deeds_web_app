import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
	requestLangExtractAnalyze,
	type LangExtractAnalyzeResponse,
} from '../atlas/ai/langextract-transport.js';

const inputSchema = z.object({
	caseId: z.string().uuid(),
	evidenceId: z.string().uuid(),
	sourceSha256: z.string().regex(/^[a-f0-9]{64}$/i),
	analysisRevision: z.string().min(1).max(256),
	text: z.string().min(1).max(10_000).refine((value) => value.trim().length > 0),
	enabled: z.boolean(),
}).strict();

export type CaseLocationTextCandidateV1 = {
	schema: 'atlas.case-location-text-candidate.v1';
	status: 'UNREVIEWED_CANDIDATE';
	coordinateStatus: 'NOT_GEOCODED';
	caseId: string;
	evidenceId: string;
	sourceSha256: string;
	analysisRevision: string;
	extractedTextSha256: string;
	mention: string;
	startChar: number;
	endChar: number;
	entityLabel: string;
	extractionSource: 'langextract-8095';
};

export type CaseLocationTextCandidateResultV1 = {
	ok: boolean;
	status: 'CANDIDATES' | 'NO_CANDIDATES' | 'DISABLED' | 'UNAVAILABLE' | 'INVALID_INPUT';
	candidates: CaseLocationTextCandidateV1[];
	errorCode?: 'LANGEXTRACT_REQUEST_FAILED';
};

const LOCATION_LABEL = /^(?:location|loc|place|address|gpe|facility|fac|landmark)$/i;
const MAX_CANDIDATES = 10;

function findVerifiedSpan(
	text: string,
	entity: LangExtractAnalyzeResponse['entities'][number],
): { startChar: number; endChar: number } | null {
	const candidate = entity.text.trim();
	if (!candidate || candidate.length > 500) return null;

	const start = entity.start;
	const end = entity.end;
	if (Number.isInteger(start) && Number.isInteger(end) && start! >= 0 && end! > start!) {
		const exact = text.slice(start!, end!);
		if (exact === entity.text || exact === candidate) {
			return { startChar: start!, endChar: end! };
		}
	}

	const first = text.indexOf(candidate);
	if (first < 0 || text.indexOf(candidate, first + candidate.length) >= 0) return null;
	return { startChar: first, endChar: first + candidate.length };
}

/**
 * Extracts source-text location mentions through the existing :8095 transport.
 * It never geocodes, assigns GPS, confirms an incident location, or writes storage.
 */
export async function extractCaseLocationTextCandidatesV1(
	input: unknown,
	request: typeof requestLangExtractAnalyze = requestLangExtractAnalyze,
): Promise<CaseLocationTextCandidateResultV1> {
	const parsed = inputSchema.safeParse(input);
	if (!parsed.success) return { ok: false, status: 'INVALID_INPUT', candidates: [] };
	if (!parsed.data.enabled) return { ok: false, status: 'DISABLED', candidates: [] };

	try {
		const response = await request({
			text: parsed.data.text,
		source_type: 'ocr_text',
			extraction_mode: 'full',
			max_chars: 10_000,
		}, { timeoutMs: 30_000, path: '/extract' });

		const candidates: CaseLocationTextCandidateV1[] = [];
		for (const entity of response.entities) {
			if (!LOCATION_LABEL.test(entity.label)) continue;
			const span = findVerifiedSpan(parsed.data.text, entity);
			if (!span) continue;
			candidates.push({
				schema: 'atlas.case-location-text-candidate.v1',
				status: 'UNREVIEWED_CANDIDATE',
				coordinateStatus: 'NOT_GEOCODED',
				caseId: parsed.data.caseId,
				evidenceId: parsed.data.evidenceId,
				sourceSha256: parsed.data.sourceSha256.toLowerCase(),
				analysisRevision: parsed.data.analysisRevision,
				extractedTextSha256: createHash('sha256').update(parsed.data.text, 'utf8').digest('hex'),
				mention: parsed.data.text.slice(span.startChar, span.endChar),
				startChar: span.startChar,
				endChar: span.endChar,
				entityLabel: entity.label,
				extractionSource: 'langextract-8095',
			});
			if (candidates.length >= MAX_CANDIDATES) break;
		}

		return candidates.length > 0
			? { ok: true, status: 'CANDIDATES', candidates }
			: { ok: true, status: 'NO_CANDIDATES', candidates: [] };
	} catch {
		return {
			ok: false,
			status: 'UNAVAILABLE',
			candidates: [],
			errorCode: 'LANGEXTRACT_REQUEST_FAILED',
		};
	}
}
