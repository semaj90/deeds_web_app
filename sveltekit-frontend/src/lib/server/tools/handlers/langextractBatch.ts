/**
 * langextract_batch Tool Handler
 *
 * Batch entity/relation extraction using LangExtract
 * Uses: documents → LangExtract API → entities + relations
 */

import {
  toolRegistry,
  LangExtractBatchRequestSchema,
  type LangExtractBatchRequest,
  type LangExtractResult,
  type ToolResult
} from '../registry.js';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { langextractFetch } from '$lib/server/langextract-client.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

interface ExtractedEntity {
  type: string;
	name: string;
  confidence: number;
}

interface ExtractedRelation {
  type: string;
	source: string;
  target: string;
	confidence: number;
}

async function extractFromDocument(
  content: string,
  entityTypes: string[],
  relationTypes: string[],
  model: string,
  timeout: number
): Promise<{
	entities: ExtractedEntity[], relations: ExtractedRelation[] }> {
  // Try LangExtract first (via shared adapter with health/URL resolution)
  try {
    const response = await langextractFetch('/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        entity_types: entityTypes,
        relation_types: relationTypes,
        model
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (response?.ok) {
      return await response.json() as { entities: ExtractedEntity[];
	relations: ExtractedRelation[] };
    }
  } catch {
    // Fallback to Ollama
  }

  // Fallback: Use Ollama for extraction
  try {
    const prompt = `Extract entities (${entityTypes.join(', ')}) and relations (${relationTypes.join(', ')}) from the following text. Return as JSON with "entities" and "relations" arrays.

Text:
${content.slice(0, 2000)}

JSON:`;

    const response = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	model,
        prompt,
        stream: false,
        options: {
	temperature: 0.1 }
      })
    });

    if (response.ok) {
      const data = await response.json() as { response: string };
      try {
        const parsed = JSON.parse(data.response);
        return {
          entities: parsed?.entities|| [],
          relations: parsed?.relations|| []
        };
      } catch {
        // Parse failed
      }
    }
  } catch {
    // Both failed
  }

  return { entities: [], relations: [] };
}

async function fetchDocumentContent(url: string, textRef: string): Promise<string> {
  // If textRef is a URL, fetch content
  if (textRef.startsWith('http')) {
    const response = await fetch(textRef);
    if (response.ok) {
      return await response.text();
    }
  }

  // If textRef is a hash/id, fetch from storage (stub)
  return `Document content for ${ url } (ref: ${ textRef })`;
}

async function langextractBatchHandler(request: LangExtractBatchRequest): Promise<ToolResult<LangExtractResult>> {
  const model = request.options?.model ?? 'gemma4-rotorquant:latest';
  const timeout = request.options?.timeout_ms ?? 30000;

  const extractions: Array<{
	doc_url: string;
    entities: ExtractedEntity[];
	relations: ExtractedRelation[];
  }> = [];

  let totalEntities = 0;
  let totalRelations = 0;

  for (const doc of request.docs) {
    try {
      const content = await fetchDocumentContent(doc.url, doc.text_ref);
      const result = await extractFromDocument(
        content,
        request.schema.entities,
        request.schema.relations,
        model,
        timeout
      );

      extractions.push({
        doc_url: doc.url,
        entities: result.entities,
        relations: result.relations
      });

      totalEntities += result.entities.length;
      totalRelations += result.relations.length;
    } catch {
      extractions.push({
        doc_url: doc.url,
        entities: [],
        relations: []
      });
    }
  }

  return {
    success: true,
    run_id: request.run_id,
    tool: 'langextract_batch',
    data: {
	extractions,
      total_entities: totalEntities,
      total_relations: totalRelations
    },
	duration_ms: 0,
    timestamp: new Date().toISOString()
  };
}

// Register the tool
toolRegistry.register({
  name: 'langextract_batch',
  description: 'Batch entity/relation extraction using LangExtract or Ollama fallback',
  schema: LangExtractBatchRequestSchema,
  permissions: ['network'],
  handler: langextractBatchHandler
});

export { langextractBatchHandler };





