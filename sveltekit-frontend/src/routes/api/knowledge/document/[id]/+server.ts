/**
 * Knowledge Document API Endpoint
 * GET /api/knowledge/document/:id
 *
 * Fetches full document content from MinIO with metadata.
 *
 * Requirements: 8.2
 */

import { getKnowledgeSearcher } from '$lib/services/knowledge-search';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const { id } = params;

    // Validate ID
    if (!id || typeof id !== 'string') {
      return json(
        { error: 'Document ID is required' },
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

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('MinIO')) {
        return json(
          { error: 'Storage service unavailable', details: error.message },
          { status: 503 }
        );
      }

      if (error.message.includes('Qdrant')) {
        return json(
          { error: 'Search service unavailable', details: error.message },
          { status: 503 }
        );
      }
    }

    return json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
};
