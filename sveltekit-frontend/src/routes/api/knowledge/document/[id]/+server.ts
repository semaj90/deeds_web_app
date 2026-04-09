/**
 * Knowledge Document API Endpoint
 * GET /api/knowledge/document/:id
 *
 * Fetches full document content from MinIO with metadata.
 *
 * Requirements: 8.2
 */

import { getKnowledgeSearcher } from '$lib/services/knowledge-search/KnowledgeSearcher.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
import { isUuid } from '$lib/server/validation.js';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const emptyDocument = {
    id: params.id,
    title: '',
    url: '',
    content: '',
    summary: '',
    entities: [],
    tags: [],
    scrapedAt: '',
    minioKey: '',
  };
  try {
    const { id } = params;

    // Validate ID
    if (!isUuid(id)) {
      return json(
        { error: 'Invalid ID format' },
        { status: 400 }
      );
    }

    // Fetch document
    const searcher = getKnowledgeSearcher();
    const document = await searcher.getDocument(id);

    if (!document) {
      return json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Return document with metadata
    return json({
      success: true,
      document: {id: document.id,
        title: document.title,
        url: document.url,
        content: document.content,
        summary: document.summary,
        entities: document.entities,
        tags: document.tags,
        scrapedAt: document.scrapedAt.toISOString(),
        minioKey: document.minioKey
      }
    });
  } catch (error) {
    console.error('Document API error:', error);
    return json({ success: false, document: emptyDocument });
  }
};
