import { describe, expect, it } from 'vitest';
import { buildEvidenceProcessPayloadV1, EvidenceProcessPayloadV1Schema } from './evidence-process-payload-v1.js';

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
			skipEmbedding: false,
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
				skipEmbedding: false,
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

	it('preserves revision and suppresses duplicate embedding when route owns canonical indexing', () => {
		expect(buildEvidenceProcessPayloadV1({
			evidenceId: 'evidence-fixture-3',
			text: 'Extracted evidence text',
			extractionMethod: 'pdf-parse',
			sourceRevision: `sha256:${'a'.repeat(64)}`,
			skipEmbedding: true,
		})).toEqual({
			evidenceId: 'evidence-fixture-3',
			text: 'Extracted evidence text',
			contentType: 'document',
			sourceRevision: `sha256:${'a'.repeat(64)}`,
			skipEmbedding: true,
		});
	});

	it('validates and preserves the Superforms case and source metadata handoff', () => {
		const payload = EvidenceProcessPayloadV1Schema.parse({
			evidenceId: '11111111-1111-4111-8111-111111111111',
			caseId: '22222222-2222-4222-8222-222222222222',
			text: 'Evidence title and description',
			contentType: 'document',
			sourceRevision: `sha256:${'b'.repeat(64)}`,
			metadata: { object_bucket: 'legal-evidence', object_name: 'evidence/1/document.png', fileType: 'image/png' },
		});
		expect(payload.caseId).toBe('22222222-2222-4222-8222-222222222222');
		expect(payload.metadata?.object_name).toBe('evidence/1/document.png');
		expect(EvidenceProcessPayloadV1Schema.safeParse({ ...payload, caseId: 'not-a-uuid' }).success).toBe(false);
	});
});
