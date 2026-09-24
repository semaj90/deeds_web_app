/**
 * VAL10B_SUMMARY_PERSISTENCE_ADMISSION_01: the persistence owner's fail-closed gate. A generated SUMMARY may be inserted only if a sealed admission report
 * (python/atlas_summary_admission_v1.py: canonical chunk re-read, VAL-03/04 + Ornith judge + VAL-09 on the EXACT text) proves every claim ADMIT and binds
 * the same chunk identity and the same raw UTF-8 sha256 the writer is about to store. Pure function: no I/O, no model, no database. Derived evidence,
 * never canonical authority. The check runs in the writer process on the in-memory text it inserts, so there is no check-then-write gap.
 */
import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

export const SUMMARY_PERSISTENCE_ADMISSION_SCHEMA = 'atlas.summary-persistence-admission.v1' as const;

const AdmissionClaimSchema = z.object({
	claimOrdinal: z.number().int().min(0),
	claimChecksum: sha256HexSchema,
	validationId: z.string().regex(/^scv:[a-f0-9]{64}$/),
	validationChecksum: sha256HexSchema,
	decision: z.enum(['PENDING', 'ADMIT', 'REVIEW', 'REJECT']),
	resolutionLayer: z.string().min(1),
	judgeInputChecksum: sha256HexSchema
}).strict();

export const SummaryPersistenceAdmissionReportV1Schema = z.object({
	schema: z.literal(SUMMARY_PERSISTENCE_ADMISSION_SCHEMA),
	chunkId: z.string().min(1),
	chunkEvidenceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	summaryOutputSha256: sha256HexSchema,
	summaryOutputChecksum: sha256HexSchema,
	splitterRevision: z.string().min(1),
	claimCount: z.number().int().min(0),
	claims: z.array(AdmissionClaimSchema),
	wholeSummaryEligible: z.boolean(),
	resolverRevision: z.string().min(1),
	validatorRevision: z.string().min(1),
	judgePromptRevision: z.string().min(1),
	judgeModelRevision: z.string().min(1).nullable(),
	canonicalAuthority: z.literal(false),
	admissionChecksum: sha256HexSchema
}).strict();
export type SummaryPersistenceAdmissionReportV1 = z.infer<typeof SummaryPersistenceAdmissionReportV1Schema>;

export type AdmissionReason =
	| 'REPORT_MISSING' | 'REPORT_INVALID' | 'UNSEALED' | 'CHUNK_MISMATCH' | 'REVISION_MISMATCH' | 'OUTPUT_CHANGED'
	| 'NO_CLAIMS' | 'CLAIM_COUNT_MISMATCH' | 'CLAIM_ORDINALS_NOT_CONTIGUOUS' | 'CLAIM_REJECT' | 'CLAIM_REVIEW' | 'CLAIM_NOT_ADMIT' | 'ELIGIBILITY_FLAG_INCONSISTENT';

export interface AdmissionCandidate { chunkId: string; chunkEvidenceRevision: string; /** raw sha256 hex of the exact summary UTF-8 bytes the writer will insert */ outputSha256: string }
export interface AdmissionVerdict { eligible: boolean; reasons: AdmissionReason[] }

export function evaluateSummaryPersistenceAdmissionV1(candidate: AdmissionCandidate, reportInput: unknown): AdmissionVerdict {
	if (reportInput === undefined || reportInput === null) return { eligible: false, reasons: ['REPORT_MISSING'] };
	const parsed = SummaryPersistenceAdmissionReportV1Schema.safeParse(reportInput);
	if (!parsed.success) return { eligible: false, reasons: ['REPORT_INVALID'] };
	const r = parsed.data;
	const { admissionChecksum, ...body } = r;
	if (canonicalSha256V1(body) !== admissionChecksum) return { eligible: false, reasons: ['UNSEALED'] };
	const reasons = new Set<AdmissionReason>();
	if (r.chunkId !== candidate.chunkId) reasons.add('CHUNK_MISMATCH');
	if (r.chunkEvidenceRevision !== candidate.chunkEvidenceRevision) reasons.add('REVISION_MISMATCH');
	if (r.summaryOutputSha256 !== candidate.outputSha256) reasons.add('OUTPUT_CHANGED');
	if (r.claimCount === 0 || r.claims.length === 0) reasons.add('NO_CLAIMS');
	if (r.claims.length !== r.claimCount) reasons.add('CLAIM_COUNT_MISMATCH');
	if (!r.claims.every((c, i) => c.claimOrdinal === i)) reasons.add('CLAIM_ORDINALS_NOT_CONTIGUOUS');
	for (const c of r.claims) {
		if (c.decision === 'REJECT') reasons.add('CLAIM_REJECT');
		else if (c.decision === 'REVIEW') reasons.add('CLAIM_REVIEW');
		else if (c.decision !== 'ADMIT') reasons.add('CLAIM_NOT_ADMIT');
	}
	const allAdmit = r.claims.length > 0 && r.claims.every((c) => c.decision === 'ADMIT');
	if (r.wholeSummaryEligible !== allAdmit) reasons.add('ELIGIBILITY_FLAG_INCONSISTENT');
	return { eligible: reasons.size === 0, reasons: [...reasons] };
}

/** Partition candidates by admission; a candidate without a report is ineligible. Nothing here writes. */
export function partitionByAdmissionV1<T extends AdmissionCandidate>(candidates: T[], reports: Map<string, unknown>, keyOf: (c: T) => string): { admitted: T[]; rejected: { candidate: T; reasons: AdmissionReason[] }[] } {
	const admitted: T[] = [];
	const rejected: { candidate: T; reasons: AdmissionReason[] }[] = [];
	for (const candidate of candidates) {
		const verdict = evaluateSummaryPersistenceAdmissionV1(candidate, reports.get(keyOf(candidate)));
		if (verdict.eligible) admitted.push(candidate); else rejected.push({ candidate, reasons: verdict.reasons });
	}
	return { admitted, rejected };
}
