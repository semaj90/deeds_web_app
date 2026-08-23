/**
 * OKF Export API Endpoint
 *
 * Exports Graphify pipeline artifacts in OpenKnowledge Framework format.
 * Supports multiple serialization formats (JSON-LD, N-Quads, Turtle).
 *
 * Endpoints:
 * - GET /api/export/okf?stage_id={id}&format=jsonld — Export single stage
 * - POST /api/export/okf/batch — Export multiple stages as package
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { OKFSerializer } from '$lib/server/export/okf-serializer';

const WORKSPACE_ROOT = process.cwd();

export const GET: RequestHandler = async ({ locals, url }) => {
  // Auth guard
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const stageId = url.searchParams.get('stage_id');
  const format = (url.searchParams.get('format') || 'jsonld') as 'jsonld' | 'nquads' | 'turtle';

  if (!stageId || !['jsonld', 'nquads', 'turtle'].includes(format)) {
    throw error(400, 'Missing or invalid stage_id / format parameter');
  }

  try {
    const serializer = new OKFSerializer();

    // In production: fetch actual stage output from Postgres/Redis
    // For now, return a template document
    const mockDocument = serializer.createDocument({
      stage_name: `Stage ${stageId}`,
      stage_id: parseInt(stageId),
      content: {
        entities: [
          {
            '@id': `okf:entity:${stageId}:1`,
            '@type': 'CodeEntity',
            name: 'Sample Entity',
            properties: { type: 'function', language: 'typescript' },
          },
        ],
        relationships: [
          {
            '@id': `okf:rel:${stageId}:1`,
            '@type': 'Relationship',
            source: `okf:entity:${stageId}:1`,
            target: `okf:entity:${stageId}:2`,
            relationType: 'CALLS',
            weight: 1.0,
          },
        ],
        facts: [
          {
            '@id': `okf:fact:${stageId}:1`,
            '@type': 'Fact',
            subject: `okf:entity:${stageId}:1`,
            predicate: 'http://purl.org/okf/core#hasType',
            object: 'function',
            confidence: 0.95,
          },
        ],
      },
      execution_duration_ms: 1000,
      execution_agent: 'graphify:stage:' + stageId,
    });

    // Serialize based on format
    let content: string;
    let contentType: string;

    switch (format) {
      case 'jsonld':
        content = serializer.serializeJsonLD(mockDocument);
        contentType = 'application/ld+json';
        break;
      case 'nquads':
        content = serializer.serializeNQuads(mockDocument);
        contentType = 'application/n-quads';
        break;
      case 'turtle':
        content = serializer.serializeTurtle(mockDocument);
        contentType = 'text/turtle';
        break;
      default:
        throw error(400, 'Unsupported format');
    }

    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="stage-${stageId}.${format === 'jsonld' ? 'jsonld' : format}"`,
      },
    });
  } catch (err) {
    console.error('[Export OKF GET] Error:', err);
    return json({ error: (err as Error).message }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  // Auth guard
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  try {
    const body = await request.json();
    const { stage_ids, package_name, format } = body;

    if (!stage_ids || !Array.isArray(stage_ids) || stage_ids.length === 0) {
      throw error(400, 'Missing or invalid stage_ids');
    }

    const serializer = new OKFSerializer();
    const documents = [];

    // Generate documents for each stage
    for (const stageId of stage_ids) {
      const doc = serializer.createDocument({
        stage_name: `Stage ${stageId}`,
        stage_id: stageId,
        content: {
          entities: [],
          relationships: [],
          facts: [],
        },
        execution_duration_ms: 1000,
        execution_agent: `graphify:stage:${stageId}`,
      });

      documents.push(doc);
    }

    // Create package
    const pkg = await serializer.createPackage(documents, package_name || 'graphify-export');

    return json({
      success: true,
      package_name: package_name || 'graphify-export',
      documents_count: documents.length,
      manifest: pkg.manifest,
      download_url: `/api/export/okf/download?package=${encodeURIComponent(package_name || 'graphify-export')}`,
    });
  } catch (err) {
    console.error('[Export OKF POST] Error:', err);
    return json({ error: (err as Error).message }, { status: 500 });
  }
};
