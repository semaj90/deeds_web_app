import { classifySourceKind } from '$lib/server/classifier/source-kind-classifier.js';
import { computePacketKey } from '$lib/server/atlas/identity/packet-key-builder.js';

export interface BuildCodeFeatureRegistryEnqueueInput {
	evidenceId: string;
	caseId: string | null;
	fileName: string;
	fileHash: string;
	fullText: string;
	featureId?: string | null;
	featureLabel?: string | null;
	workspaceRevision?: string | null;
	representationRevision?: string | null;
	producerId?: string | null;
	producerRevision?: string | null;
	featureRevision?: string | null;
	sourceTables?: string[];
}

export interface CodeFeatureRegistryEnqueuePayload {
	[key: string]: unknown;
	sourceRef: string;
	sourceRevision: string;
	packetKey: string;
	text: string;
	featureId: string;
	featureLabel: string;
	workspaceRevision: string | null;
	jsonlSourceDigest: string;
	jsonlRecordIndex: number;
	jsonlLineNumber: number;
	jsonlParserRevision: string;
	representationRevision: string;
	producerId: string;
	producerRevision: string;
	featureRevision: string;
	sourceTables: string[];
}

export interface BuildCodeFeatureRegistryEnqueueResult {
	jobType: 'code_feature_registry';
	result: CodeFeatureRegistryEnqueuePayload;
}

export function buildCodeFeatureRegistryEnqueueResult(
	input: BuildCodeFeatureRegistryEnqueueInput
): BuildCodeFeatureRegistryEnqueueResult | null {
	if (classifySourceKind(input.fileName, input.fullText) !== 'code') return null;

	return {
		jobType: 'code_feature_registry',
		result: {
			sourceRef: input.fileName,
			sourceRevision: `sha256:${input.fileHash}`,
			packetKey: computePacketKey(input.fileName, null, null),
			text: input.fullText,
			featureId: input.featureId ?? input.evidenceId,
			featureLabel: input.featureLabel ?? input.fileName,
			workspaceRevision: input.workspaceRevision ?? input.caseId,
			jsonlSourceDigest: `sha256:${input.fileHash}`,
			jsonlRecordIndex: 0,
			jsonlLineNumber: 0,
			jsonlParserRevision: 'upload-route-v1',
			representationRevision: input.representationRevision ?? 'semantic_768@1',
			producerId: input.producerId ?? 'evidence-upload-route',
			producerRevision: input.producerRevision ?? 'upload-route-v1',
			featureRevision: input.featureRevision ?? 'upload-route-v1',
			sourceTables: input.sourceTables ?? ['analysis_jobs', 'evidence', 'code_features', 'analysis_pass_results'],
		},
	};
}
