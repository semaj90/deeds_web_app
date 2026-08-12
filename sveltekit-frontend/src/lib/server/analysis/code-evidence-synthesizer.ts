import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  buildPosConceptTaggingPacketFromSource,
  type BuildPosConceptTaggingPacketFromSourceInput,
  type BuildPosConceptTaggingPacketFromSourceResult,
} from './source-pos-concept-packet.js';

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
