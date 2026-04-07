import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { validateInternalUrl } from '$lib/server/security/url-validator.js';

/** POST /api/v1/legal/compare-pdf — Compare document against legal corpus */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
    const formData = await request.formData();
    const fileUrl = formData.get('fileUrl') as string | null;
    const text = formData.get('text') as string | null;
    const tagsRaw = formData.get('tags') as string | null;
    const topK = Math.min(Number(formData.get('topK')) || 8, 50);

    // SSRF protection: only allow internal MinIO service URLs
    if (fileUrl) {
      const urlCheck = validateInternalUrl(fileUrl, ['minio', 'legal-ai-minio']);
      if (!urlCheck.valid) {
        return json(
          { success: false, error: urlCheck.error ?? 'Only internal MinIO URLs are allowed' },
          { status: 400 }
        );
      }
    }

    const tags = tagsRaw
      ? tagsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];

    // Get text content for comparison
    let compareText = (text || '').slice(0, 50000);
    if (fileUrl && !compareText) {
      // Attempt to fetch and extract text from the file URL
      try {
        const res = await fetch(fileUrl, { signal: AbortSignal.timeout(15_000) });
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('pdf')) {
            const buffer = Buffer.from(await res.arrayBuffer());
            const pdfParse = (await import('pdf-parse')).default;
            const parsed = await pdfParse(buffer);
            compareText = parsed.text;
          } else {
            compareText = await res.text();
          }
        }
      } catch {
        // Non-fatal: file fetch failed
      }
    }

    if (!compareText) {
      return json({ success: false, error: 'No text content to compare' }, { status: 400 });
    }

    // Generate embedding for the text
    const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
    const embResult = await generateEmbeddings([compareText.slice(0, 8000)]);
    const embedding = embResult?.vectors?.[0];

    if (!embedding || embedding.length !== 768) {
      return json({ success: true, data: [] });
    }

    // Search legal_documents collection
    const { QdrantClient } = await import('@qdrant/js-client-rest');
    const { ENV } = await import('$lib/server/env.server.js');
    const client = new QdrantClient({ url: ENV.QDRANT_URL });

    const results = await client.search('legal_documents', {
      vector: embedding,
      limit: topK,
      score_threshold: 0.3,
      with_payload: true,
    });

    const matches = results.map((r) => {
      const payload = r.payload as Record<string, unknown> | null;
      return {
        id: String(r.id),
        title: String(payload?.title ?? payload?.filename ?? 'Document'),
        score: r.score,
        tags: Array.isArray(payload?.tags) ? payload.tags : [],
        excerpt: String(payload?.text ?? '').slice(0, 300),
      };
    });

    return json({ success: true, data: matches });
  } catch (err) {
    console.error('[/api/v1/legal/compare-pdf] error:', err);
    return json({ success: false, error: 'Comparison failed' }, { status: 500 });
  }
};