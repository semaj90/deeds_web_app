import { describe, expect, it, vi } from 'vitest';

vi.mock('./ai/vlm-document-analyzer.js', () => ({ analyzeWithVlm: vi.fn() }));

import { processDocument } from './document-processor';
import { countEg2DocumentTokens, countEg2Tokens } from './eg2-token-counter';

describe('processDocument observe-only routingPlan', () => {
	it('attaches a plan whose token count uses the canonical EG2 recipe', async () => {
		const text = 'Section 12 applies. See 42 U.S.C. § 1983.\nFooter\nFooter\n';
		const result = await processDocument({
			buffer: Buffer.from(text, 'utf-8'),
			fileName: 'brief.txt',
			mimeType: 'text/plain',
			skipEmbedding: true
		});
		expect(result.routingPlan).toBeDefined();
		expect(result.routingPlan!.tokenCount).toBe(countEg2DocumentTokens('brief.txt', result.rawText));
		expect(result.routingPlan!.truncationAllowed).toBe(false);
		expect(result.routingPlan!.tokenCountSource).toBe('exact');
		expect(result.routingPlan!.auxiliaryStages).toEqual(expect.arrayContaining(['nlp_classify', 'structure_parse', 'citation_extract']));
	});

	it('leaves chunking output unchanged by the plan and uses exact EG2 token counts', async () => {
		const result = await processDocument({
			buffer: Buffer.from('plain text body for the chunker', 'utf-8'),
			fileName: 'note.txt',
			mimeType: 'text/plain',
			skipEmbedding: true
		});
		expect(result.rawText).toBe('plain text body for the chunker');
		expect(result.chunks.length).toBe(1);
		expect(result.chunks[0].tokenCount).toBe(countEg2Tokens('plain text body for the chunker'));
		expect(result.embeddings).toBeUndefined();
	});
});
