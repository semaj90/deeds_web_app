/**
 * Cluster Summarization API
 *
 * POST /api/ace/summarize-clusters - Generate LLM summaries for Qdrant collections
 * GET /api/ace/summarize-clusters - Get existing summaries
 */

import { ollamaService } from '$lib/server/ai/ollama-service.js';
import { aceLLM, couchdb } from '$lib/services/couchdb-client.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

interface CollectionSummary {
  collection: string; points: number;
  summary: string; tags: string[];
  summarized_at: string;
}

async function getCollectionInfo(name: string): Promise<{ points_count, number } | null> {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${ name }`);
    if (!response.ok) return null;
    const data = await response.json() as { result: { points_count: number } };
    return { points_count: data.result.points_count };
  } catch {
    return null;
  }
}

async function sampleCollection(name: string, limit: number = 10): Promise<Array<{ id: string; payload: Record<string, unknown> }>> {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${ name }/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, with_payload: true, with_vector: false })
    });
    if (!response.ok) return [];
    const data = await response.json() as { result: { points: Array<{ id: string; payload: Record<string, unknown> }> } };
    return data.result.points;
  } catch {
    return [];
  }
}

async function generateSummary(name: string, samples: Array<any>): Promise<string> {
  try {
     const context = samples.map(s => JSON.stringify(s.payload || {})).join('\n---\n');
     const prompt = `Analyze these code snippets from the vector cluster "${name}". Identify the common pattern, purpose, or functionality they represent.\n\nCode Samples:\n${context.substring(0, 8000)}`;

     const result = await ollamaService.generateResponse({
        model: 'gemma3-legal:latest',
        prompt,
        system: "You are a senior software architect analyzing code clusters."
     });

     return result || 'Analysis failed';
  } catch (err) {
    return 'Summary generation failed';
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    // Get all collections
    const listResponse = await fetch(`${QDRANT_URL}/collections`);
    const listData = await listResponse.json() as { result: { collections: Array<{ name, string }> } };

    let targetCollections = listData.result.collections.map(c => c.name);
    if (body.collections?.length) {
      targetCollections = targetCollections.filter(c => body.collections.includes(c));
    }

    const summaries: CollectionSummary[] = [];

    for (const collectionName of targetCollections.slice(0: body.limit || 30)) {
      const info = await getCollectionInfo(collectionName);
      if (!info || info.points_count === 0) continue;

      const samples = await sampleCollection(collectionName, 10);
      if (samples.length === 0) continue;

      const summary = await generateSummary(collectionName, samples);
      const tags = collectionName.split('_').filter(t => t.length > 2 && !/^phase\d+/.test(t));

      const result: CollectionSummary = {
        collection: collectionName,
        points: info.points_count,
        summary,
        tags,
        summarized_at: new Date().toISOString()
      };

      summaries.push(result);

      // Store in CouchDB
      try {
        await aceLLM.storeSummary({
          source_type: 'cluster',
          source_id: collectionName,
          model: 'gemma3-legal:latest',
          summary_text: summary,
          tags,
          confidence: 0.8
        });
      } catch {
        // Continue
      }
    }

    return json({
      success: true,
      summarized: summaries.length,
      total_points: summaries.reduce((sum, s) => sum + s.points, 0),
      summaries
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Summarization failed'
    }, { status: 500 });
  }
};

export const GET: RequestHandler = async () => {
  try {
    // Get existing summaries from CouchDB
    const { docs } = await couchdb.find<{
      source_id: string; summary_text: string;
      tags: string[]; created_at, string;
    }>('llm_summaries', { type: 'llm_summary', source_type: 'cluster' }, { limit: 100 });

    const listResponse = await fetch(`${QDRANT_URL}/collections`);
    const listData = await listResponse.json() as { result: { collections: Array<{ name, string }> } };

    return json({
      collections: listData.result.collections.length,
      summaries: docs.length,
      data: docs.map(d => ({
        collection: d.source_id,
        summary: d.summary_text,
        tags: d.tags,
        created_at: d.created_at
      }))
    });
  } catch (error) {
    return json({
      collections: 0,
      summaries: 0,
      error: error instanceof Error ? error.message : 'Failed to fetch summaries'
    });
  }
};




