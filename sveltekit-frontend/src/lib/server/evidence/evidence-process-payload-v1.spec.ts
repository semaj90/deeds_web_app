import { describe, expect, it } from 'vitest';
import { buildEvidenceProcessPayloadV1 } from './evidence-process-payload-v1.js';

describe('buildEvidenceProcessPayloadV1', () => {
	it('hands extracted document text to the evidence worker', () => {
		expect(
			buildEvidenceProcessPayloadV1({
				evidenceId: 'evidence-fixture-1',
				text: '  The exhibit states the delivery date.  ',
				extractionMethod: 'docling-pdf',
			}),
		).toEqual({
			evidenceId: 'evidence-fixture-1',
			text: 'The exhibit states the delivery date.',
			contentType: 'document',
		});
	});

	it.each(['whisper-base-en', 'faster-whisper-en', 'docling-asr'])(
		'marks %s output as audio transcription',
		(extractionMethod) => {
			expect(
				buildEvidenceProcessPayloadV1({
					evidenceId: 'audio-fixture-1',
					text: '  Spoken words  ',
					extractionMethod,
				}),
			).toEqual({
				evidenceId: 'audio-fixture-1',
				text: 'Spoken words',
				contentType: 'audio_transcription',
			});
		},
	);

	it('does not enqueue empty extraction output', () => {
		expect(
			buildEvidenceProcessPayloadV1({
				evidenceId: 'evidence-fixture-2',
				text: '  \n ',
				extractionMethod: 'failed',
			}),
		).toBeNull();
	});
});
