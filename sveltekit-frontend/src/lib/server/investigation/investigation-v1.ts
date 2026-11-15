/**
 * Case investigation service: WHO / WHAT / WHY / HOW facets, relations to evidence, persons and
 * case notes, the immutable AI summary export with lineage, and the export/analysis review ledgers.
 * Every operation is scoped to one case and checked here, not only in the route.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { caseNotes, evidence, evidenceAnalysisCache } from '$lib/server/db/schema-postgres.js';
import { casePersons } from '$lib/server/db/schema/persons.js';
import {
	caseAiSummaryExportReviews,
	caseAiSummaryExportSources,
	caseAiSummaryExports,
	caseInvestigationFacets,
	investigationFacetEvidence,
	investigationFacetNotes
} from '$lib/server/db/schema/investigation.js';
import { LLAMA_SERVER_BASE_URL, getLlamaSessionModel } from '$lib/server/ai/local-llama-provider.js';
import {
	boundEvidenceText,
	buildHashes,
	buildSummaryPrompt,
	extractCitations,
	sha256Hex,
	stripReasoning,
	unsupportedCitations,
	unsupportedSections,
	type FacetKind,
	type InvestigationManifest
} from './investigation-manifest-v1.js';

export class InvestigationError extends Error {
	constructor(
		readonly code: string,
		readonly status: number,
		message: string,
		readonly details?: Record<string, unknown>
	) {
		super(message);
	}
}

/**
 * True when the failure is a PostgreSQL unique violation (SQLSTATE 23505) anywhere in the wrapped error chain.
 * The caller then re-reads by command ID; if no committed winner exists, the original error is rethrown.
 */
function isUniqueViolation(cause: unknown): boolean {
	let current: unknown = cause;
	for (let depth = 0; depth < 6 && current; depth++) {
		const pg = current as { code?: string; cause?: unknown };
		if (pg.code === '23505') return true;
		current = pg.cause;
	}
	return false;
}

const SYSTEM_PROMPT =
	'You are an investigation analyst. Answer only from the supplied case facts and evidence. ' +
	'Cite evidence with [evidence:<id>] using only ids that are listed. Never invent facts or ids.';

const MODEL_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 1200;

type FacetRow = typeof caseInvestigationFacets.$inferSelect;
type ExportRow = typeof caseAiSummaryExports.$inferSelect;

interface ListedExportRow {
	id: string;
	revision: number;
	commandId: string;
	createdBy: number;
	inputManifestSha256: string;
	facetSnapshotSha256: string;
	summarySha256: string;
	modelId: string;
	summaryMarkdown: string;
	citations: string[];
	createdAt: Date;
}

interface LinkRow {
	facetId: string;
	evidenceId: string;
	relevance: number;
	note: string | null;
	title: string;
	fileName: string | null;
	summary: string | null;
	aiSummary: string | null;
}

interface NoteRow {
	facetId: string;
	noteId: string;
	title: string | null;
	isAi: boolean | null;
}

interface EvidenceTextRow {
	id: string;
	title: string;
	summary: string | null;
	aiSummary: string | null;
	extractedText: string | null;
}

interface ReviewRow {
	exportId: string;
	decision: string;
	reviewedBy: number;
	note: string | null;
	reviewedAt: Date;
}

async function assertFacetInCase(caseId: string, facetId: string): Promise<FacetRow> {
	const [facet] = (await db
		.select()
		.from(caseInvestigationFacets)
		.where(and(eq(caseInvestigationFacets.id, facetId), eq(caseInvestigationFacets.caseId, caseId)))
		.limit(1)) as FacetRow[];
	if (!facet) throw new InvestigationError('FACET_NOT_FOUND', 404, 'Facet not found in this case');
	return facet;
}

async function assertEvidenceInCase(caseId: string, evidenceId: string) {
	const [item] = await db
		.select({ id: evidence.id })
		.from(evidence)
		.where(and(eq(evidence.id, evidenceId), eq(evidence.caseId, caseId), isNull(evidence.deletedAt)))
		.limit(1);
	if (!item) throw new InvestigationError('EVIDENCE_NOT_FOUND', 404, 'Evidence not found in this case');
}

async function assertPersonInCase(caseId: string, personId: string) {
	const [link] = await db
		.select({ id: casePersons.id })
		.from(casePersons)
		.where(and(eq(casePersons.caseId, caseId), eq(casePersons.personId, personId)))
		.limit(1);
	if (!link) throw new InvestigationError('PERSON_NOT_IN_CASE', 404, 'Person of interest is not linked to this case');
}

async function assertCaseNoteInCase(caseId: string, caseNoteId: string) {
	const [note] = await db
		.select({ id: caseNotes.id })
		.from(caseNotes)
		.where(and(eq(caseNotes.id, caseNoteId), eq(caseNotes.caseId, caseId)))
		.limit(1);
	if (!note) throw new InvestigationError('NOTE_NOT_FOUND', 404, 'Case note not found in this case');
}

export async function listInvestigation(caseId: string) {
	const facets = (await db
		.select()
		.from(caseInvestigationFacets)
		.where(eq(caseInvestigationFacets.caseId, caseId))
		.orderBy(asc(caseInvestigationFacets.facetKind), asc(caseInvestigationFacets.createdAt))) as FacetRow[];

	const facetIds = facets.map((facet) => facet.id);
	let links: LinkRow[] = [];
	let notes: NoteRow[] = [];
	if (facetIds.length > 0) {
		links = (await db
			.select({
				facetId: investigationFacetEvidence.facetId,
				evidenceId: investigationFacetEvidence.evidenceId,
				relevance: investigationFacetEvidence.relevance,
				note: investigationFacetEvidence.note,
				title: evidence.title,
				fileName: evidence.fileName,
				summary: evidence.summary,
				aiSummary: evidence.aiSummary
			})
			.from(investigationFacetEvidence)
			.innerJoin(evidence, eq(evidence.id, investigationFacetEvidence.evidenceId))
			.where(and(inArray(investigationFacetEvidence.facetId, facetIds), isNull(evidence.deletedAt)))) as LinkRow[];

		notes = (await db
			.select({
				facetId: investigationFacetNotes.facetId,
				noteId: caseNotes.id,
				title: caseNotes.title,
				isAi: caseNotes.isAI
			})
			.from(investigationFacetNotes)
			.innerJoin(caseNotes, eq(caseNotes.id, investigationFacetNotes.caseNoteId))
			.where(inArray(investigationFacetNotes.facetId, facetIds))) as NoteRow[];
	}

	return facets.map((facet) => ({
		id: facet.id,
		facetKind: facet.facetKind as FacetKind,
		claimText: facet.claimText,
		status: facet.status,
		confidence: facet.confidence,
		personId: facet.personId,
		revision: facet.revision,
		createdAt: facet.createdAt,
		evidence: links
			.filter((link) => link.facetId === facet.id)
			.map((link) => ({
				evidenceId: link.evidenceId,
				title: link.title,
				fileName: link.fileName,
				summary: link.summary ?? link.aiSummary ?? null,
				relevance: link.relevance,
				note: link.note
			})),
		notes: notes
			.filter((note) => note.facetId === facet.id)
			.map((note) => ({ noteId: note.noteId, title: note.title, isAi: note.isAi }))
	}));
}

export async function createFacet(input: {
	caseId: string;
	actorId: number;
	facetKind: FacetKind;
	claimText: string;
	confidence: number | null;
	personId?: string | null;
}) {
	if (input.personId) await assertPersonInCase(input.caseId, input.personId);
	const [row] = await db
		.insert(caseInvestigationFacets)
		.values({
			caseId: input.caseId,
			facetKind: input.facetKind,
			claimText: input.claimText,
			confidence: input.confidence,
			personId: input.personId ?? null,
			createdBy: input.actorId
		})
		.returning();
	return row;
}

export async function linkEvidence(input: {
	caseId: string;
	facetId: string;
	evidenceId: string;
	actorId: number;
	relevance: number;
	note: string | null;
}) {
	await assertFacetInCase(input.caseId, input.facetId);
	await assertEvidenceInCase(input.caseId, input.evidenceId);
	const [row] = await db
		.insert(investigationFacetEvidence)
		.values({
			facetId: input.facetId,
			evidenceId: input.evidenceId,
			relevance: input.relevance,
			note: input.note,
			linkedBy: input.actorId
		})
		.onConflictDoUpdate({
			target: [investigationFacetEvidence.facetId, investigationFacetEvidence.evidenceId],
			set: { relevance: input.relevance, note: input.note }
		})
		.returning();
	return row;
}

export async function unlinkEvidence(input: { caseId: string; facetId: string; evidenceId: string }) {
	await assertFacetInCase(input.caseId, input.facetId);
	const removed = await db
		.delete(investigationFacetEvidence)
		.where(
			and(
				eq(investigationFacetEvidence.facetId, input.facetId),
				eq(investigationFacetEvidence.evidenceId, input.evidenceId)
			)
		)
		.returning({ evidenceId: investigationFacetEvidence.evidenceId });
	return removed.length > 0;
}

export async function linkCaseNote(input: { caseId: string; facetId: string; caseNoteId: string; actorId: number }) {
	await assertFacetInCase(input.caseId, input.facetId);
	await assertCaseNoteInCase(input.caseId, input.caseNoteId);
	const [row] = await db
		.insert(investigationFacetNotes)
		.values({ facetId: input.facetId, caseNoteId: input.caseNoteId, linkedBy: input.actorId })
		.onConflictDoNothing()
		.returning({ caseNoteId: investigationFacetNotes.caseNoteId });
	return row ?? { caseNoteId: input.caseNoteId, alreadyLinked: true };
}

export async function unlinkCaseNote(input: { caseId: string; facetId: string; caseNoteId: string }) {
	await assertFacetInCase(input.caseId, input.facetId);
	const removed = await db
		.delete(investigationFacetNotes)
		.where(and(eq(investigationFacetNotes.facetId, input.facetId), eq(investigationFacetNotes.caseNoteId, input.caseNoteId)))
		.returning({ caseNoteId: investigationFacetNotes.caseNoteId });
	return removed.length > 0;
}

/** Latest review per export. An export with no review is DRAFT. */
async function reviewStatusByExport(exportIds: string[]) {
	const latest = new Map<string, ReviewRow>();
	if (exportIds.length === 0) return latest;
	const rows = (await db
		.select({
			exportId: caseAiSummaryExportReviews.exportId,
			decision: caseAiSummaryExportReviews.decision,
			reviewedBy: caseAiSummaryExportReviews.reviewedBy,
			note: caseAiSummaryExportReviews.note,
			reviewedAt: caseAiSummaryExportReviews.reviewedAt
		})
		.from(caseAiSummaryExportReviews)
		.where(inArray(caseAiSummaryExportReviews.exportId, exportIds))
		.orderBy(desc(caseAiSummaryExportReviews.reviewedAt))) as ReviewRow[];
	for (const row of rows) {
		if (!latest.has(row.exportId)) latest.set(row.exportId, row);
	}
	return latest;
}

export async function listSummaryExports(caseId: string) {
	const exports = (await db
		.select({
			id: caseAiSummaryExports.id,
			revision: caseAiSummaryExports.revision,
			commandId: caseAiSummaryExports.commandId,
			createdBy: caseAiSummaryExports.createdBy,
			inputManifestSha256: caseAiSummaryExports.inputManifestSha256,
			facetSnapshotSha256: caseAiSummaryExports.facetSnapshotSha256,
			summarySha256: caseAiSummaryExports.summarySha256,
			modelId: caseAiSummaryExports.modelId,
			summaryMarkdown: caseAiSummaryExports.summaryMarkdown,
			citations: caseAiSummaryExports.citations,
			createdAt: caseAiSummaryExports.createdAt
		})
		.from(caseAiSummaryExports)
		.where(eq(caseAiSummaryExports.caseId, caseId))
		.orderBy(desc(caseAiSummaryExports.revision))
		.limit(50)) as ListedExportRow[];

	const reviews = await reviewStatusByExport(exports.map((row) => row.id));
	return exports.map((row) => {
		const review = reviews.get(row.id) ?? null;
		return {
			...row,
			status: review ? review.decision : 'DRAFT',
			latestReview: review
				? { decision: review.decision, reviewedBy: review.reviewedBy, reviewedAt: review.reviewedAt, note: review.note }
				: null
		};
	});
}

/** Records an append-only review. The author of an export cannot review that export (four-eyes). */
export async function reviewSummaryExport(input: {
	caseId: string;
	exportId: string;
	actorId: number;
	decision: 'APPROVED' | 'REJECTED';
	note: string | null;
}) {
	const [exportRow] = (await db
		.select()
		.from(caseAiSummaryExports)
		.where(and(eq(caseAiSummaryExports.id, input.exportId), eq(caseAiSummaryExports.caseId, input.caseId)))
		.limit(1)) as ExportRow[];
	if (!exportRow) throw new InvestigationError('EXPORT_NOT_FOUND', 404, 'Summary export not found in this case');
	if (exportRow.createdBy === input.actorId) {
		throw new InvestigationError('SELF_REVIEW_FORBIDDEN', 403, 'The author of a summary export cannot review it');
	}
	const [review] = await db
		.insert(caseAiSummaryExportReviews)
		.values({ exportId: input.exportId, decision: input.decision, reviewedBy: input.actorId, note: input.note })
		.returning();
	return review;
}

/** Sets review status on an analysis result. Only results attached to this case can be changed. */
export async function reviewAnalysisResult(input: {
	caseId: string;
	analysisId: string;
	actorId: number;
	status: 'ACCEPTED' | 'REJECTED' | 'UNREVIEWED';
}) {
	const [updated] = await db
		.update(evidenceAnalysisCache)
		.set({ reviewStatus: input.status, reviewedBy: input.actorId, reviewedAt: new Date() })
		.where(and(eq(evidenceAnalysisCache.id, input.analysisId), eq(evidenceAnalysisCache.caseId, input.caseId)))
		.returning({ id: evidenceAnalysisCache.id, reviewStatus: evidenceAnalysisCache.reviewStatus });
	if (!updated) throw new InvestigationError('ANALYSIS_NOT_FOUND', 404, 'Analysis result not found in this case');
	return updated;
}

/** Builds the bounded, case-scoped manifest the model and the hashes both see. */
export async function buildInvestigationManifest(caseId: string): Promise<InvestigationManifest> {
	const facets = await listInvestigation(caseId);
	const linkedEvidenceIds: string[] = [
		...new Set(facets.flatMap((facet) => facet.evidence.map((item) => item.evidenceId)))
	];
	if (linkedEvidenceIds.length === 0) {
		throw new InvestigationError('NO_LINKED_EVIDENCE', 422, 'Link evidence to at least one facet before exporting a summary');
	}
	const rows = (await db
		.select({
			id: evidence.id,
			title: evidence.title,
			summary: evidence.summary,
			aiSummary: evidence.aiSummary,
			extractedText: evidence.extractedText
		})
		.from(evidence)
		.where(and(inArray(evidence.id, linkedEvidenceIds), eq(evidence.caseId, caseId), isNull(evidence.deletedAt)))) as EvidenceTextRow[];

	return {
		caseId,
		facets: facets.map((facet) => ({
			id: facet.id,
			kind: facet.facetKind,
			claim: facet.claimText,
			status: facet.status,
			confidence: facet.confidence,
			links: facet.evidence.map((item) => ({ evidenceId: item.evidenceId, relevance: item.relevance }))
		})),
		evidence: rows.map((row) => ({
			id: row.id,
			title: row.title,
			text: boundEvidenceText({ aiSummary: row.aiSummary, summary: row.summary, extractedText: row.extractedText })
		}))
	};
}

/**
 * Streams one completion from llama-server. Project rule: llama-server is always called with
 * stream:true, and only delta.content is kept.
 */
export async function requestSummaryFromModel(prompt: string, model: string): Promise<string> {
	let response: Response;
	try {
		response = await fetch(`${LLAMA_SERVER_BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				stream: true,
				max_tokens: MAX_OUTPUT_TOKENS,
				temperature: 0.2,
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: prompt }
				]
			}),
			signal: AbortSignal.timeout(MODEL_TIMEOUT_MS)
		});
	} catch {
		throw new InvestigationError('MODEL_UNREACHABLE', 503, 'Local language model is unreachable');
	}
	if (!response.ok || !response.body) {
		throw new InvestigationError('MODEL_HTTP_ERROR', 502, `Local language model returned HTTP ${response.status}`);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let content = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let newline = buffer.indexOf('\n');
		while (newline >= 0) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf('\n');
			if (!line.startsWith('data:')) continue;
			const payload = line.slice(5).trim();
			if (payload === '[DONE]') return stripReasoning(content);
			try {
				const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
				if (typeof delta === 'string') content += delta;
			} catch {
				// Non-JSON keepalive frames are ignored; the completion is judged on its content.
			}
		}
	}
	return stripReasoning(content);
}

export interface GenerateSummaryResult {
	exportRow: ExportRow;
	replayed: boolean;
}

/**
 * Generates one immutable summary revision and its lineage rows in one transaction.
 * Idempotent on commandId: a retry returns the stored revision without calling the model again.
 */
export async function generateSummaryExport(input: {
	caseId: string;
	actorId: number;
	commandId: string;
	requestModel?: (prompt: string, model: string) => Promise<string>;
	resolveModel?: () => Promise<string>;
	beforeInsert?: () => Promise<void>;
}): Promise<GenerateSummaryResult> {
	const [existing] = (await db
		.select()
		.from(caseAiSummaryExports)
		.where(eq(caseAiSummaryExports.commandId, input.commandId))
		.limit(1)) as ExportRow[];
	if (existing) {
		if (existing.caseId !== input.caseId) {
			throw new InvestigationError('COMMAND_CONFLICT', 409, 'commandId already used for another case');
		}
		// A replay is only valid for the same investigation state; otherwise it would return a stale export.
		const current = buildHashes(await buildInvestigationManifest(input.caseId)).inputManifestSha256;
		if (existing.inputManifestSha256 !== current) {
			throw new InvestigationError('COMMAND_REUSED', 409, 'commandId was already used for a different investigation state');
		}
		return { exportRow: existing, replayed: true };
	}

	const manifest = await buildInvestigationManifest(input.caseId);
	const hashes = buildHashes(manifest);
	const model = await (input.resolveModel ?? getLlamaSessionModel)();
	const markdown = await (input.requestModel ?? requestSummaryFromModel)(buildSummaryPrompt(manifest), model);
	if (markdown.length === 0) {
		throw new InvestigationError('MODEL_EMPTY_OUTPUT', 502, 'Model returned no summary text');
	}

	const admittedIds = manifest.evidence.map((item) => item.id);
	const cited = extractCitations(markdown);
	const rejected = unsupportedCitations(cited, admittedIds);
	if (rejected.length > 0) {
		// Fail closed: unsupported citations are reported, never silently dropped.
		throw new InvestigationError('UNSUPPORTED_CITATIONS', 422, 'Summary cites evidence that is not linked to this case', {
			rejectedEvidenceIds: rejected
		});
	}
	// Server-side structure check: a WHO/WHAT/WHY/HOW section with no facet behind it must say "No facet recorded."
	const invented = unsupportedSections(markdown, manifest.facets.map((facet) => facet.kind));
	if (invented.length > 0) {
		throw new InvestigationError('UNSUPPORTED_SECTION', 422, 'Summary states conclusions for a category with no recorded facet', {
			sections: invented
		});
	}

	// Test seam: lets a test commit a competing command after the pre-check and before this transaction.
	if (input.beforeInsert) await input.beforeInsert();
	let exportRow: ExportRow;
	try {
	exportRow = (await db.transaction(async (tx: typeof db) => {
		// Serialize revision numbering per case.
		await tx.execute(sql`SELECT id FROM cases WHERE id = ${input.caseId} FOR UPDATE`);
		const [{ next }] = (await tx
			.select({ next: sql<number>`coalesce(max(${caseAiSummaryExports.revision}), 0) + 1` })
			.from(caseAiSummaryExports)
			.where(eq(caseAiSummaryExports.caseId, input.caseId))) as Array<{ next: number }>;
		const [row] = (await tx
			.insert(caseAiSummaryExports)
			.values({
				caseId: input.caseId,
				revision: Number(next),
				commandId: input.commandId,
				inputManifestSha256: hashes.inputManifestSha256,
				facetSnapshotSha256: hashes.facetSnapshotSha256,
				summarySha256: sha256Hex(markdown),
				modelId: model,
				summaryMarkdown: markdown,
				citations: cited,
				createdBy: input.actorId
			})
			.returning()) as ExportRow[];

		const sources = manifest.facets.flatMap((facet) =>
			facet.links.map((link) => ({
				exportId: row.id,
				facetId: facet.id,
				evidenceId: link.evidenceId,
				relevance: link.relevance
			}))
		);
		if (sources.length > 0) {
			await tx.insert(caseAiSummaryExportSources).values(sources);
		}
		return row;
	})) as ExportRow;
	} catch (cause) {
		// A concurrent request with the same commandId committed first. Return that committed revision.
		if (isUniqueViolation(cause)) {
			const [winner] = (await db
				.select()
				.from(caseAiSummaryExports)
				.where(eq(caseAiSummaryExports.commandId, input.commandId))
				.limit(1)) as ExportRow[];
			if (!winner) throw cause;
			if (winner && winner.caseId === input.caseId) {
				if (winner.inputManifestSha256 !== hashes.inputManifestSha256) {
					throw new InvestigationError('COMMAND_REUSED', 409, 'commandId was already used for a different investigation state');
				}
				return { exportRow: winner, replayed: true };
			}
			throw new InvestigationError('COMMAND_CONFLICT', 409, 'commandId already used for another case');
		}
		throw cause;
	}
	return { exportRow, replayed: false };
}
