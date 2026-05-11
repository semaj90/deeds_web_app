/**
 * Source Validation API
 *
 * Human-in-the-loop source validation for RAG answers
 * POST /api/kb/validate
 */


import { couchdb } from '$lib/server/services/couchdb-client.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { ENV } from '$lib/server/env.server.js';

const QDRANT_URL = ENV.QDRANT_URL;

const validateSourcesSchema = z.object({
  query_id: z.string().min(1).max(500),
  case_id: z.string().max(500).optional(),
  selected_chunk_ids: z.array(z.string().max(500)).min(1).max(100),
  rejected_chunk_ids: z.array(z.string().max(500)).max(100).optional(),
  user_notes: z.string().max(5000).optional(),
  pin_to_canvas: z.boolean().optional()
});

interface ValidatedSource { chunk_id: string, content: string;
  metadata: Record<string, unknown>;
  selected: boolean;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const raw = await request.json();
    const parsed = validateSourcesSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const body = parsed.data;

    // Fetch selected chunks from Qdrant
    const selectedSources: ValidatedSource[] = [];

    for (const chunkId of body.selected_chunk_ids) {
      try {
        const response = await fetch(`${QDRANT_URL}/collections/embeddings/points/${chunkId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5_000)
        });

        if (response.ok) {
          const data = await response.json() as { result: { payload: Record<string, unknown> } };
          selectedSources.push({
            chunk_id: chunkId,
            content: String(data.result.payload?.content ?? ''),
            metadata: data.result.payload,
            selected: true
          });
        }
      } catch {
        // Continue with other chunks
      }
    }

    // Store validation record in CouchDB
    const validationRecord = {
      _id: `validation_${body.query_id}_${Date.now()}`,
      type: 'source_validation',
      query_id: body.query_id,
      case_id: body.case_id,
      selected_chunk_ids: body.selected_chunk_ids,
      rejected_chunk_ids: body?.rejected_chunk_ids|| [],
      user_notes: body.user_notes,
      pinned_to_canvas: body?.pin_to_canvas|| false,
      sources_count: selectedSources.length,
      validated_at: new Date().toISOString()
    };

    try {
      await couchdb.post('ace_validations', validationRecord);
    } catch (error) {
      console.warn('CouchDB validation storage failed:', error);
    }

    // If pinning to canvas, update case state
    if (body?.pin_to_canvas&& body.case_id) {
      try {
        const canvasUpdate = {
          _id: `canvas_pin_${body.case_id}_${Date.now()}`,
          type: 'canvas_pin',
          case_id: body.case_id,
          query_id: body.query_id,
          pinned_sources: selectedSources.map(s => ({
            chunk_id: s.chunk_id,
            preview: s.content.slice(0, 200),
            metadata: s.metadata
          })),
          pinned_at: new Date().toISOString()
        };

        await couchdb.post('ace_validations', canvasUpdate);
      } catch (error) {
        console.warn('Canvas pin failed:', error);
      }
    }

    return json({
      success: true,
      validated_sources: selectedSources.length,
      validation_id: validationRecord._id,
      approved_context: selectedSources.map(s => ({
       chunk_id: s.chunk_id,
        content: s.content
      }))
    });
  } catch (error) {
    console.error('[KB Validate] Error:', error);
    return json({
      success: false,
      error: 'Validation failed'
    }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ url, locals, request }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const queryId = url.searchParams.get('query_id');
  const caseId = url.searchParams.get('case_id');

  if (!queryId && !caseId) {
    return json({
      error: 'query_id or case_id required'
    }, { status: 400 });
  }

  try {
    const result = await couchdb.allDocs('ace_validations', { include_docs: true, limit: 50 });
    const docs = result.rows
      .map(r => r.doc)
      .filter((doc): doc is Record<string, unknown> => {
        if (!doc || doc.type !== 'source_validation') return false;
        if (queryId && doc.query_id !== queryId) return false;
        if (caseId && doc.case_id !== caseId) return false;
        return true;
      });

    const responseData = {
      validations: docs,
      count: docs.length
    };

    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);

    return json(responseData, {
      headers: { ...cacheControl.short, ETag: etag }
    });
  } catch (error) {
    return json({
      validations: [],
      error: 'Failed to fetch validations'
    }, {
      headers: cacheControl.short
    });
  }
};




