import { beforeEach, describe, expect, it, vi } from 'vitest';

const { archiveCapture } = vi.hoisted(() => ({ archiveCapture: vi.fn() }));

vi.mock('@deeds/parent-atlas', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@deeds/parent-atlas')>();
	return { ...actual, archiveExternalDocCapture: archiveCapture };
});
vi.mock('../../env.server.js', () => ({ ENV: { FIRECRAWL_API_KEY: 'fixture-key', SEAWEED_S3_BUCKET: 'fixture-bucket' } }));
vi.mock('./seaweed-cold-object-store.js', () => ({ createSeaweedColdObjectStore: vi.fn(() => ({ kind: 'fixture-store' })) }));

import { captureExternalDocWithFirecrawlV2 } from './firecrawl-v2-capture.js';

const options = {
	sourceId: 'sveltekit-docs',
	sourceRevision: 'docs-r2',
	url: 'https://example.test/sveltekit/2',
	namespace: 'fixture-docs',
};

describe('captureExternalDocWithFirecrawlV2', () => {
	beforeEach(() => {
		archiveCapture.mockReset();
		archiveCapture.mockImplementation(async ({ capture }) => capture);
	});

	it('preserves source identity and deterministic capture ID from the Firecrawl fixture', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({
			success: true,
			data: {
				markdown: '# SvelteKit 2\n\nRoute handlers',
				links: ['https://example.test/sveltekit/2/routing', 'not a URL'],
				metadata: { title: 'SvelteKit 2', sourceURL: options.url, statusCode: 200, language: 'en' },
			},
		}), { status: 200, headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);
		try {
			const first = await captureExternalDocWithFirecrawlV2(options);
			const second = await captureExternalDocWithFirecrawlV2(options);
			expect(first.capture_id).toBe(second.capture_id);
			expect(first).toMatchObject({
				source_id: options.sourceId,
				source_revision: options.sourceRevision,
				requested_url: options.url,
				resolved_url: options.url,
				title: 'SvelteKit 2',
				markdown: '# SvelteKit 2\n\nRoute handlers',
				canonical_authority: false,
				outgoing_urls: ['https://example.test/sveltekit/2/routing'],
			});
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.firecrawl.dev/v2/scrape');
			expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
			expect(archiveCapture).toHaveBeenCalledTimes(2);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('rejects empty Firecrawl content before calling the archive owner', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { markdown: '  ' } }), { status: 200 })));
		try {
			await expect(captureExternalDocWithFirecrawlV2(options)).rejects.toThrow('FIRECRAWL_V2_MARKDOWN_MISSING');
			expect(archiveCapture).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
