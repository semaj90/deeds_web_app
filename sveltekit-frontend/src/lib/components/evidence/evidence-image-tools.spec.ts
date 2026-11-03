import { describe, expect, it, vi } from 'vitest';
import { analyzeStoredEvidenceImage, requestEvidenceUpscale } from './evidence-image-tools';

describe('evidence image tools', () => {
	it('requests analysis for the authorized evidence record', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
			success: true,
			analysis: { summary: 'Possible storefront', keyFindings: ['Sign visible'], suggestedTags: ['storefront'] },
		}), { status: 200, headers: { 'content-type': 'application/json' } }));

		const result = await analyzeStoredEvidenceImage('evidence/id', fetcher);

		expect(fetcher).toHaveBeenCalledWith('/api/evidence/evidence%2Fid/vlm-analyze', expect.objectContaining({ method: 'POST' }));
		expect(fetcher.mock.calls[0]?.[1]?.body).toBe('{}');
		expect(result.analysis.summary).toBe('Possible storefront');
	});

	it('requests an authorized 2x preview and validates its image response', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Blob(['png'], { type: 'image/png' }), {
			status: 200,
			headers: { 'content-type': 'image/png', 'X-Upscale-Size': '1200x800' },
		}));

		const result = await requestEvidenceUpscale('evidence/id', 2, fetcher);

		expect(fetcher).toHaveBeenCalledWith('/api/evidence/evidence%2Fid/upscale', expect.objectContaining({ method: 'POST' }));
		expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ scale: 2 });
		expect(result.dimensions).toBe('1200x800');
		expect(result.blob.type).toBe('image/png');
	});

	it('surfaces model-mode and authorization errors without masking them', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'VLM not in VISION mode', hint: 'Switch to VISION' }), {
			status: 503,
			headers: { 'content-type': 'application/json' },
		}));

		await expect(analyzeStoredEvidenceImage('evidence-1', fetcher))
			.rejects.toThrow('VLM not in VISION mode — Switch to VISION');
	});
});
