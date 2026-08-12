import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
	buildPosConceptTaggingPacketFromSource,
	type BuildPosConceptTaggingPacketFromSourceInput,
	type BuildPosConceptTaggingPacketFromSourceResult,
} from './source-pos-concept-packet.js';
import type { AnalysisPassLedgerInput } from '$lib/server/db/schema/analysis-pass-results.js';

const RECEIPT_SCHEMA_VERSION = 'code-evidence-synthesizer-receipt.v1' as const;

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
	}

	return `{${Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
		.join(',')}}`;
}

function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function normalizeSha256Digest(value: string): string {
	return value.startsWith('sha256:') ? value : `sha256:${value}`;
}

export const CodeEvidenceSynthesizerReceiptSchema = z.object({
	schemaVersion: z.literal(RECEIPT_SCHEMA_VERSION),
	receiptId: z.string().min(1),
	createdAt: z.string().min(1),
	sourceRef: z.string().min(1),
	sourceRevision: z.string().min(1),
	packetKey: z.string().min(1),
	workspaceRevision: z.string().nullable(),
	treeNodeId: z.string().nullable(),
	titleId: z.string().nullable(),
	featureId: z.string().min(1),
	featureLabel: z.string().min(1),
	representationId: z.string().min(1),
	representationRevision: z.string().min(1),
	producerId: z.string().min(1),
	producerRevision: z.string().min(1),
	featureRevision: z.string().min(1),
	graphRevision: z.string().nullable(),
	ontologyRevision: z.string().nullable(),
	modelRevision: z.string().nullable(),
	jsonlSourceDigest: z.string().min(1),
	jsonlRecordIndex: z.number().int().nonnegative(),
	jsonlLineNumber: z.number().int().nonnegative(),
	jsonlParserRevision: z.string().min(1),
	extractedFeatureCount: z.number().int().nonnegative(),
	astSymbolCount: z.number().int().nonnegative(),
	semanticConceptCount: z.number().int().nonnegative(),
	ontologyIdCount: z.number().int().nonnegative(),
	partOfSpeech: z.string().min(1),
	primaryDomain: z.string().nullable(),
	secondaryDomains: z.array(z.string().min(1)),
	semanticDimension: z.literal(768),
	inputDigest: z.string().min(1),
	outputDigest: z.string().min(1),
	sourceTables: z.array(z.string().min(1)),
	status: z.literal('BUILT'),
});

export type CodeEvidenceSynthesizerReceipt = z.infer<typeof CodeEvidenceSynthesizerReceiptSchema>;

export interface BuildCodeEvidenceSynthesizerReceiptFromSourceResult
	extends BuildPosConceptTaggingPacketFromSourceResult {
	receipt: CodeEvidenceSynthesizerReceipt;
}

export interface BuildCodeEvidenceLedgerInputFromSourceInput
{
	analysisJobId: string;
	evidenceId: string;
	caseId?: string | null;
	jobType: string;
	packetKey: string;
	sourceRef: string;
	sourceRevision: string;
	workspaceRevision?: string | null;
	representationRevision: string;
	family: string;
	passName: string;
	passRevision: string;
	backend: string;
	backendVersion: string;
	device: 'cpu' | 'cuda' | 'external';
	startedAt: string;
	completedAt: string;
	durationMs?: number | null;
	analysisWorkerProducerId: string;
	analysisWorkerProducerRevision: string;
	synthesized?: BuildCodeEvidenceSynthesizerReceiptFromSourceResult | null;
}

export function buildCodeEvidenceLedgerInputFromSource(
	input: BuildCodeEvidenceLedgerInputFromSourceInput
): AnalysisPassLedgerInput | null {
	if (!input.synthesized) return null;

	const packet = input.synthesized.packet;
	const receipt = input.synthesized.receipt;

	return {
		analysisJobId: input.analysisJobId,
		evidenceId: input.evidenceId,
		caseId: input.caseId ?? null,
		jobType: input.jobType,
		packetKey: receipt.packetKey,
		sourceRef: receipt.sourceRef,
		sourceRevision: receipt.sourceRevision,
		workspaceRevision: receipt.workspaceRevision,
		representationRevision: receipt.representationRevision,
		family: input.family,
		passName: input.passName,
		passRevision: input.passRevision,
		passType: input.passName,
		featureId: receipt.featureId,
		producerId: input.analysisWorkerProducerId,
		producerRevision: input.analysisWorkerProducerRevision,
		backend: input.backend,
		backendVersion: input.backendVersion,
		device: input.device,
		status: 'succeeded',
		startedAt: input.startedAt,
		completedAt: input.completedAt,
		durationMs: input.durationMs ?? null,
		payload: {
			codeEvidenceReceipt: receipt,
			posConceptPacket: packet,
			posConceptPacketKey: input.synthesized.packetKey,
			posConceptPacketStatus: 'built',
			codeEvidenceReceiptStatus: 'built',
		},
		features: {
			extractedFeatureCount: receipt.extractedFeatureCount,
			astSymbolCount: receipt.astSymbolCount,
			semanticConceptCount: receipt.semanticConceptCount,
			ontologyIdCount: receipt.ontologyIdCount,
			semanticDimension: receipt.semanticDimension,
			primaryDomain: receipt.primaryDomain,
		},
		artifacts: {
			sourceTables: receipt.sourceTables,
			jsonlSourceDigest: receipt.jsonlSourceDigest,
			jsonlRecordIndex: receipt.jsonlRecordIndex,
			jsonlLineNumber: receipt.jsonlLineNumber,
			jsonlParserRevision: receipt.jsonlParserRevision,
			outputDigest: receipt.outputDigest,
		},
		evidence: [
			{
				sourceRef: receipt.sourceRef,
				sourceRevision: receipt.sourceRevision,
				packetKey: receipt.packetKey,
				receiptId: receipt.receiptId,
				status: receipt.status,
			},
		],
		warnings: [],
		modelId: receipt.modelRevision ?? null,
		modelRevision: receipt.modelRevision ?? null,
	};
}

function buildReceiptId(seed: Omit<CodeEvidenceSynthesizerReceipt, 'receiptId' | 'createdAt'>): string {
	return `code-evidence:${sha256Hex(stableStringify(seed)).slice(0, 24)}`;
}

export async function buildCodeEvidenceSynthesizerReceiptFromSource(
	input: BuildPosConceptTaggingPacketFromSourceInput
): Promise<BuildCodeEvidenceSynthesizerReceiptFromSourceResult | null> {
	const built = await buildPosConceptTaggingPacketFromSource(input);
	if (!built) return null;

	const packet = built.packet as BuildPosConceptTaggingPacketFromSourceResult['packet'] & {
		inputDigest?: string;
		outputDigest?: string;
	};
	const domainClassification = packet.domainClassification ?? null;
	const receiptSeed = {
		schemaVersion: RECEIPT_SCHEMA_VERSION,
		createdAt: packet.generatedAt,
		sourceRef: packet.sourceRef,
		sourceRevision: packet.sourceRevision,
		packetKey: packet.packetKey,
		workspaceRevision: packet.workspaceRevision ?? null,
		treeNodeId: packet.treeNodeId,
		titleId: packet.titleId,
		featureId: packet.featureId,
		featureLabel: packet.featureLabel,
		representationId: packet.representationId,
		representationRevision: packet.representationRevision,
		producerId: packet.producerId,
		producerRevision: packet.producerRevision,
		featureRevision: packet.featureRevision,
		graphRevision: packet.graphRevision,
		ontologyRevision: packet.ontologyRevision,
		modelRevision: packet.modelRevision,
		jsonlSourceDigest: packet.jsonlParsedEvidence.content_hash,
		jsonlRecordIndex: packet.jsonlParsedEvidence.record_index,
		jsonlLineNumber: packet.jsonlParsedEvidence.line_number,
		jsonlParserRevision: packet.jsonlParsedEvidence.parser_revision,
		extractedFeatureCount: built.extractedFeatures.length,
		astSymbolCount: packet.astSymbols.length,
		semanticConceptCount: packet.semanticConceptIds.length,
		ontologyIdCount: packet.ontologyIds.length,
		partOfSpeech: packet.posTaggerOutput.part_of_speech,
		primaryDomain: domainClassification?.primary_label ?? null,
		secondaryDomains: domainClassification?.secondary_labels ?? [],
		semanticDimension: 768 as const,
		inputDigest: packet.inputDigest,
		outputDigest: normalizeSha256Digest(packet.outputDigest),
		sourceTables: packet.sourceTables,
		status: 'BUILT' as const,
	};

	const receipt = CodeEvidenceSynthesizerReceiptSchema.parse({
		...receiptSeed,
		receiptId: buildReceiptId(receiptSeed),
		createdAt: packet.generatedAt,
	});

	return {
		...built,
		receipt,
	};
}
