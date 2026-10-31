import { z } from 'zod';

export const EvidenceProcessPayloadV1Schema = z.object({
	evidenceId: z.string().min(1),
	text: z.string().trim().min(1),
	contentType: z.enum(['document', 'audio_transcription']),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
	caseId: z.string().uuid().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	skipEmbedding: z.boolean().default(false),
});

export type EvidenceProcessPayloadV1 = z.infer<typeof EvidenceProcessPayloadV1Schema>;

export function buildEvidenceProcessPayloadV1(input: {
	evidenceId: string;
	text: string;
	extractionMethod: string;
	sourceRevision?: string;
	caseId?: string;
	metadata?: Record<string, unknown>;
	skipEmbedding?: boolean;
}): EvidenceProcessPayloadV1 | null {
	const text = input.text.trim();
	if (!text) return null;

	return EvidenceProcessPayloadV1Schema.parse({
		evidenceId: input.evidenceId,
		text,
		sourceRevision: input.sourceRevision,
		caseId: input.caseId,
		metadata: input.metadata,
		skipEmbedding: input.skipEmbedding ?? false,
		contentType:
			input.extractionMethod.startsWith('whisper-') ||
			input.extractionMethod.startsWith('faster-whisper-') ||
			input.extractionMethod === 'docling-asr'
				? 'audio_transcription'
				: 'document',
	});
}
