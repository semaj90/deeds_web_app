import { z } from 'zod';

import {
	normalizeAnalysisPassLedgerInput,
	type AnalysisPassLedgerInput,
	type NewAnalysisPassResultRow,
} from '../db/schema/analysis-pass-results.js';
import {
	LexicalFeatureRegistryV1Schema,
	type LexicalFeatureRegistryV1,
} from './lexical-feature-registry-v1.js';
import { stableStringify, sha256Hex } from './stable-hash.js';

export const LEXICAL_PASS_NAME_V1 = 'lexical_features' as const;
export const LEXICAL_PASS_FAMILY_V1 = 'lexical' as const;
export const LEXICAL_PASS_PRODUCER_ID_V1 = 'parent-atlas-lexical-feature-registry' as const;

export const LexicalPassLedgerAdapterInputV1Schema = z
	.object({
		analysisJobId: z.string().min(1),
		evidenceId: z.string().min(1),
		passRevision: z.string().min(1),
		startedAt: z.string().datetime({ offset: true }),
		completedAt: z.string().datetime({ offset: true }),
		result: LexicalFeatureRegistryV1Schema,
	})
	.strict();

export type LexicalPassLedgerAdapterInputV1 = z.infer<
	typeof LexicalPassLedgerAdapterInputV1Schema
>;

export const LexicalPassAdmissionProofV1Schema = z
	.object({
		schema: z.literal('parent-atlas.lexical-pass-admission-proof.v1'),
		status: z.literal('READY_FOR_LIVE_ADMISSION'),
		packetKey: z.string().min(1),
		sourceRevision: z.string().min(1),
		workspaceRevision: z.string().min(1),
		passRevision: z.string().min(1),
		passIdentityHash: z.string().regex(/^[a-f0-9]{64}$/),
		deterministicReplay: z.literal(true),
		databaseWritePerformed: z.literal(false),
		workerRegistered: z.literal(false),
	})
	.strict();

export type LexicalPassAdmissionProofV1 = z.infer<typeof LexicalPassAdmissionProofV1Schema>;

/**
 * Converts a pure lexical registry result to the existing pass-ledger input.
 * This function only constructs and validates a row-shaped value; it never
 * calls the database writer. Packet identity and all revisions are mandatory
 * here so a future adapter cannot silently create an unqualified pass result.
 */
export function buildLexicalPassLedgerInputV1(
	input: LexicalPassLedgerAdapterInputV1,
): AnalysisPassLedgerInput {
	const parsed = LexicalPassLedgerAdapterInputV1Schema.parse(input);
	const result: LexicalFeatureRegistryV1 = parsed.result;

	if (!result.packetKey) {
		throw new Error('LEXICAL_PASS_PACKET_KEY_REQUIRED');
	}
	for (const value of [result.packetKey, result.sourceRef, result.sourceRevision,
		result.workspaceRevision, parsed.passRevision, parsed.analysisJobId, parsed.evidenceId]) {
		if (!value.trim() || value !== value.trim()) throw new Error('LEXICAL_PASS_INVALID_IDENTITY');
	}
	const { checksum, ...body } = result;
	if (sha256Hex(stableStringify(body)) !== checksum) throw new Error('LEXICAL_PASS_CHECKSUM_MISMATCH');
	if (Date.parse(parsed.completedAt) < Date.parse(parsed.startedAt)) {
		throw new Error('LEXICAL_PASS_INVALID_TIME_ORDER');
	}

	return {
		analysisJobId: parsed.analysisJobId,
		evidenceId: parsed.evidenceId,
		jobType: 'lexical_feature_registry',
		packetKey: result.packetKey,
		sourceRef: result.sourceRef,
		sourceRevision: result.sourceRevision,
		workspaceRevision: result.workspaceRevision,
		family: LEXICAL_PASS_FAMILY_V1,
		passName: LEXICAL_PASS_NAME_V1,
		passType: LEXICAL_PASS_NAME_V1,
		passRevision: parsed.passRevision,
		producerId: LEXICAL_PASS_PRODUCER_ID_V1,
		producerRevision: result.extractorRevision,
		backend: 'native-ts',
		backendVersion: result.extractorRevision,
		device: 'cpu',
		// The generic ledger's logical key omits workspace/sourceRef. Bind the
		// complete extraction envelope here so cross-workspace reuse cannot occur.
		inputHash: sha256Hex(stableStringify({
			sourceRef: result.sourceRef, sourceRevision: result.sourceRevision,
			workspaceRevision: result.workspaceRevision, language: result.language,
			extractorRevision: result.extractorRevision, contentChecksum: result.inputChecksum,
		})),
		status: 'succeeded',
		startedAt: parsed.startedAt,
		completedAt: parsed.completedAt,
		payload: {
			lexicalFeatureRegistry: result,
		},
		features: {
			tokenCount: result.tokenStats.tokenCount,
			uniqueTokenCount: result.tokenStats.uniqueTokenCount,
			identifierCount: result.tokenStats.identifierCount,
			literalCount: result.tokenStats.literalCount,
		},
		evidence: [
			{
				kind: 'lexical_feature_registry',
				sourceRef: result.sourceRef,
				sourceRevision: result.sourceRevision,
				workspaceRevision: result.workspaceRevision,
				inputChecksum: result.inputChecksum,
				registryChecksum: result.checksum,
			},
		],
	};
}

/**
 * Pure row adapter for tests and an eventual explicitly admitted writer.
 * Persisting the returned value remains the responsibility of the existing
 * `recordAnalysisPassResult` owner after live admission is approved.
 */
export function buildLexicalPassLedgerRowV1(
	input: LexicalPassLedgerAdapterInputV1,
): NewAnalysisPassResultRow {
	return normalizeAnalysisPassLedgerInput(buildLexicalPassLedgerInputV1(input));
}

/**
 * Proves deterministic adapter replay without touching Postgres. The live
 * gate must still exercise `recordAnalysisPassResult` and readback against an
 * authorized fixture; this precheck only proves that the adapter itself does
 * not manufacture a different identity or payload on replay.
 */
export function proveLexicalPassAdmissionV1(
	input: LexicalPassLedgerAdapterInputV1,
): LexicalPassAdmissionProofV1 {
	const first = buildLexicalPassLedgerRowV1(input);
	const second = buildLexicalPassLedgerRowV1(input);
	const comparable = (row: NewAnalysisPassResultRow) =>
		stableStringify({
			passKey: row.passKey,
			passIdentityHash: row.passIdentityHash,
			packetKey: row.packetKey,
			sourceRef: row.sourceRef,
			passType: row.passType,
			inputHash: row.inputHash,
			output: row.output,
			scores: row.scores,
			provenance: row.provenance,
			sourceRevision: row.sourceRevision,
			passRevision: row.passRevision,
		});

	if (comparable(first) !== comparable(second)) {
		throw new Error('LEXICAL_PASS_NON_DETERMINISTIC_ADAPTER');
	}

	return LexicalPassAdmissionProofV1Schema.parse({
		schema: 'parent-atlas.lexical-pass-admission-proof.v1',
		status: 'READY_FOR_LIVE_ADMISSION',
		packetKey: first.packetKey,
		sourceRevision: first.sourceRevision,
		workspaceRevision: String((first.provenance as Record<string, unknown>).workspaceRevision),
		passRevision: first.passRevision,
		passIdentityHash: first.passIdentityHash,
		deterministicReplay: true,
		databaseWritePerformed: false,
		workerRegistered: false,
	});
}
