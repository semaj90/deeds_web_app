/**
 * ACE Cluster Summarization Script
 *
 * Runs cluster analysis across all Qdrant collections
 * and generates LLM summaries stored in CouchDB
 */

import { couchdb, aceLLM } from '../src/lib/services/couchdb-client.js';
import { llamaChat } from '../../scripts/atlas/lib/llama-inference.mjs';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

interface CollectionInfo {
  name: string;
  points_count: number;
  vectors_count: number;
}

async function getCollectionInfo(name: string): Promise<CollectionInfo | null> {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${name}`);
    if (!response.ok) return null;
    const data = await response.json() as { result: { points_count: number; vectors_count: number } };
    return {
      name,
      points_count: data.result.points_count,
      vectors_count: data.result.vectors_count
    };
  } catch {
    return null;
  }
}

async function sampleCollection(name: string, limit: number = 10): Promise<Array<{ id: string; payload: Record<string, unknown> }>> {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${name}/points/scroll`, {
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

async function generateSummary(collectionName: string, samples: Array<{ id: string; payload: Record<string, unknown> }>): Promise<string> {
  // Extract representative content
  const sampleContent = samples.map(s => {
    const content = s.payload.content || s.payload.text || s.payload.error || s.payload.message || JSON.stringify(s.payload).slice(0, 200);
    return `- ${String(content).slice(0, 150)}`;
  }).join('\n');

  const prompt = `Analyze this Qdrant collection "${collectionName}" containing ${samples.length} sample entries.

Samples:
${sampleContent}

Provide a 2-3 sentence summary describing:
1. What type of data this collection contains
2. Key patterns or categories you observe
3. How this data might be useful for a legal AI system

Summary:`;

  try {
    const text = await llamaChat(prompt, { maxTokens: 200, temperature: 0.3 });
    if (!text || !text.trim()) {
      // Fallback summary
      return `Collection "${collectionName}" contains ${samples.length}+ entries. Data includes: ${Object.keys(samples[0]?.payload || {}).join(', ')}`;
    }
    return text.trim();
  } catch (error) {
    return `Collection "${collectionName}" - LLM unavailable. Contains ${samples.length}+ entries with keys: ${Object.keys(samples[0]?.payload || {}).join(', ')}`;
  }
}

async function summarizeCollections(): Promise<void> {
  console.log('🔍 ACE Cluster Summarization\n');
  console.log('━'.repeat(60));

  // Get all collections
  const listResponse = await fetch(`${QDRANT_URL}/collections`);
  const listData = await listResponse.json() as { result: { collections: Array<{ name: string }> } };
  const collections = listData.result.collections;

  console.log(`\n📊 Found ${collections.length} Qdrant collections\n`);

  const summaries: Array<{
    collection: string;
    points: number;
    summary: string;
    tags: string[];
  }> = [];

  for (const col of collections) {
    process.stdout.write(`  Processing ${col.name}...`);

    const info = await getCollectionInfo(col.name);
    if (!info || info.points_count === 0) {
      console.log(' (empty, skipping)');
      continue;
    }

    const samples = await sampleCollection(col.name, 10);
    if (samples.length === 0) {
      console.log(' (no samples)');
      continue;
    }

    const summary = await generateSummary(col.name, samples);

    // Extract tags from collection name
    const tags = col.name.split('_').filter(t => t.length > 2 && !/^phase\d+/.test(t));

    summaries.push({
      collection: col.name,
      points: info.points_count,
      summary,
      tags
    });

    // Store in CouchDB
    try {
      await aceLLM.storeSummary({
        source_type: 'cluster',
        source_id: col.name,
        model: 'gemma3-legal:latest',
        summary_text: summary,
        tags,
        confidence: 0.8
      });
      console.log(` ✅ (${info.points_count} points)`);
    } catch {
      console.log(` ⚠️ (CouchDB error)`);
    }
  }

  // Print report
  console.log('\n' + '━'.repeat(60));
  console.log('\n📋 CLUSTER SUMMARY REPORT\n');

  for (const s of summaries) {
    console.log(`\n📦 ${s.collection} (${s.points} points)`);
    console.log(`   Tags: ${s.tags.join(', ') || 'N/A'}`);
    console.log(`   ${s.summary.slice(0, 200)}${s.summary.length > 200 ? '...' : ''}`);
  }

  console.log('\n' + '━'.repeat(60));
  console.log(`\n✅ Summarized ${summaries.length} collections`);
  console.log(`📊 Total points: ${summaries.reduce((sum, s) => sum + s.points, 0)}`);
}

// Run if executed directly
summarizeCollections().catch(console.error);
