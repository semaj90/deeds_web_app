import { z } from 'zod';

export const EvidenceProcessPayloadV1Schema = z.object({
	evidenceId: z.string().min(1),
	text: z.string().trim().min(1),
	contentType: z.enum(['document', 'audio_transcription']),
});

export type EvidenceProcessPayloadV1 = z.infer<typeof EvidenceProcessPayloadV1Schema>;

export function buildEvidenceProcessPayloadV1(input: {
	evidenceId: string;
	text: string;
	extractionMethod: string;
}): EvidenceProcessPayloadV1 | null {
	const text = input.text.trim();
	if (!text) return null;

	return EvidenceProcessPayloadV1Schema.parse({
		evidenceId: input.evidenceId,
		text,
		contentType:
			input.extractionMethod.startsWith('whisper-') ||
			input.extractionMethod.startsWith('faster-whisper-') ||
			input.extractionMethod === 'docling-asr'
				? 'audio_transcription'
				: 'document',
	});
}
