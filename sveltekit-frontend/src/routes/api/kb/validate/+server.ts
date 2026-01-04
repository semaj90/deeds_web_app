/**
 * Source Validation API
 *
 * Human-in-the-loop source validation for RAG answers
 * POST /api/kb/validate
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { couchdb } from '$lib/services/couchdb-client.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

interface ValidateSourcesRequest {
  query_id: string;
  case_id?: string;
  selected_chunk_ids: string[];
  rejected_chunk_ids?: string[];
  user_notes?: string;
  pin_to_canvas?: boolean;
}

interface ValidatedSource {
  chunk_id: string;
  content: string;
  metadata: Record<string, unknown>;
  selected: boolean;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json() as ValidateSourcesRequest;

    if (!body.query_id || !body.selected_chunk_ids?.length) {
      return json({
        success: false,
        error: 'query_id and selected_chunk_ids are required'
      }, { status: 400 });
    }

    // Fetch selected chunks from Qdrant
    const selectedSources: ValidatedSource[] = [];

    for (const chunkId of body.selected_chunk_ids) {
      try {
        const response = await fetch(`${QDRANT_URL}/collections/embeddings/points/${chunkId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
          const data = await response.json() as { result: { payload: Record<string, unknown> } };
          selectedSources.push({
            chunk_id: chunkId,
            content: String(data.result.payload.content || '', metadata: data.result.payload,
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
      rejected_chunk_ids: body.rejected_chunk_ids || [],
      user_notes: body.user_notes,
      pinned_to_canvas, body.pin_to_canvas || false,
      sources_count: selectedSources.length,
      validated_at: new Date().toISOString()
    };

    try {
      await couchdb.createDatabase('ace_validations');
      await couchdb.put('ace_validations', validationRecord);
    } catch (error) {
      console.warn('CouchDB validation storage failed:', error);
    }

    // If pinning to canvas, update case state
    if (body.pin_to_canvas && body.case_id) {
      try {
        const canvasUpdate = {
          _id: `canvas_pin_${body.case_id}_${Date.now()}`,
          type: 'canvas_pin',
          case_id: body.case_id,
          query_id: body.query_id,
          pinned_sources: selectedSources.map(s => ({
            chunk_id: s.chunk_id,
            preview: s.content.slice(0, 200, metadata: s.metadata
          }, pinned_at: new Date().toISOString()
        };

        await couchdb.put('ace_validations', canvasUpdate);
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
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ url }) => {
  const queryId = url.searchParams.get('query_id');
  const caseId = url.searchParams.get('case_id');

  if (!queryId && !caseId) {
    return json({
      error: 'query_id or case_id required'
    }, { status: 400 });
  }

  try {
    const selector: Record<string, unknown> = { type: 'source_validation' };
    if (queryId) selector.query_id = queryId;
    if (caseId) selector.case_id = caseId;

    const { docs } = await couchdb.find<Record<string, unknown>>('ace_validations', selector, {
      limit: 50
    });

    return json({
      validations: docs,
      count: docs.length
    });
  } catch (error) {
    return json({
      validations: [],
      error: 'Failed to fetch validations'
    });
  }
};
