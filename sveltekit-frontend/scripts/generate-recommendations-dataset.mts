#!/usr/bin/env npx tsx
/**
 * Phase 79: Generate Recommendations Dataset
 *
 * Creates a JSONL dataset with:
 * - Error recommendations
 * - LLM suggestions
 * - Cosine similarity rankings from knowledge base
 * - Inverse search ranking (1-10)
 * - File summaries
 * - RAG context
 */

import 'dotenv/config';
import postgres from 'postgres';
import fs from 'fs/promises';
import path from 'path';
import { QdrantClient } from '@qdrant/js-client-rest';
import Redis from 'ioredis';

// Configuration
const DATABASE_URL = process.env.DATABASE_URL!;
const sql = postgres(DATABASE_URL);
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '../data/recommendations');
const DATASET_FILE = path.join(OUTPUT_DIR, `recommendations-${Date.now()}.jsonl`);

interface RecommendationEntry {
  id: string;
  timestamp: string;
  error: {
    code: string;
    message: string;
    file_path: string;
    route_path: string;
    cluster_id: string;
  };
  file_summary: {
    content_length: number;
    imports: string[];
    exports: string[];
    first_30_lines: string;
  };
  knowledge_base: {
    similar_patches: Array<{
      id: string;
      content: string;
      cosine_similarity: number;
      rank: number;
    }>;
    rag_documents: Array<{
      chunk_type: string;
      content_preview: string;
      similarity: number;
    }>;
  };
  llm_input: {
    prompt: string;
    context_files: string[];
    model_used: string;
    complexity: 'simple' | 'complex';
  };
  llm_output: {
    raw_response: string;
    is_valid_code: boolean;
    extracted_patch: string | null;
  };
  recommendation: {
    action: string;
    priority: number; // 1-10 inverse ranking
    confidence: number;
    strategy: string;
  };
}

// Generate embedding using Ollama
async function generateEmbedding(text: string): Promise<number[]> {
  const cacheKey = `embedding:${Buffer.from(text.substring(0, 200)).toString('base64').substring(0, 64)}`;

  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      prompt: text.substring(0, 4096)
    })
  });

  const data = await response.json() as { embedding?: number[] };
  const embedding = data.embedding || [];

  await redis.setex(cacheKey, 3600, JSON.stringify(embedding)).catch(() => {});
  return embedding;
}

// Cosine similarity calculation
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Search Qdrant for similar patches
async function searchSimilarPatches(embedding: number[], limit = 10): Promise<Array<{
  id: string;
  content: string;
  cosine_similarity: number;
  rank: number;
}>> {
  try {
    const { points: results } = await qdrant.query('phase79_knowledge_base', {
      query: embedding,
      limit,
      with_payload: true
    });

    return results.map((r, index) => ({
      id: String(r.id),
      content: String(r.payload?.content || r.payload?.patch || '').substring(0, 500),
      cosine_similarity: r.score,
      rank: index + 1 // 1-based ranking
    }));
  } catch (e) {
    return [];
  }
}

// Query PostgreSQL knowledge base with embeddings
async function queryKnowledgeBase(embedding: number[]): Promise<Array<{
  chunk_type: string;
  content_preview: string;
  similarity: number;
}>> {
  try {
    // Query pg_vector for similar documents
    const results = await sql`
      SELECT
        chunk_type,
        LEFT(content, 200) as content_preview,
        1 - (embedding <=> ${JSON.stringify(embedding)}::vector) as similarity
      FROM knowledge_base
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(embedding)}::vector
      LIMIT 5
    `;

    return results.map((r: any) => ({
      chunk_type: r.chunk_type,
      content_preview: r.content_preview,
      similarity: r.similarity
    }));
  } catch (e) {
    return [];
  }
}

// Read and summarize file
async function summarizeFile(filePath: string): Promise<{
  content_length: number;
  imports: string[];
  exports: string[];
  first_30_lines: string;
}> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    return {
      content_length: content.length,
      imports: lines.filter(l => l.includes('import ')).slice(0, 10),
      exports: lines.filter(l => l.includes('export ')).slice(0, 5),
      first_30_lines: lines.slice(0, 30).join('\n')
    };
  } catch (e) {
    return {
      content_length: 0,
      imports: [],
      exports: [],
      first_30_lines: ''
    };
  }
}

// Determine error complexity
function getComplexity(errorCode: string, message: string): 'simple' | 'complex' {
  const complexPatterns = [
    /state/i, /store/i, /async/i, /promise/i, /generic/i,
    /inference/i, /binding/i, /lifecycle/i, /render/i
  ];
  const isComplex = complexPatterns.some(p => p.test(message) || p.test(errorCode));
  return isComplex ? 'complex' : 'simple';
}

// Calculate inverse priority ranking (1=highest, 10=lowest)
function calculatePriority(
  errorCode: string,
  riskLevel: string,
  cosineSimilarity: number,
  hasKnowledge: boolean
): number {
  let score = 5; // Base score

  // Risk level adjustment
  if (riskLevel === 'high') score -= 2;
  else if (riskLevel === 'medium') score -= 1;
  else score += 1;

  // High similarity = easier to fix = lower priority
  if (cosineSimilarity > 0.9) score += 2;
  else if (cosineSimilarity > 0.7) score += 1;
  else if (cosineSimilarity < 0.5) score -= 1;

  // Has knowledge base entries = easier
  if (hasKnowledge) score += 1;

  // Clamp to 1-10
  return Math.min(10, Math.max(1, score));
}

// Generate LLM prompt with full context
function buildPrompt(
  error: { code: string; message: string },
  fileSummary: { imports: string[]; exports: string[]; first_30_lines: string },
  similarPatches: Array<{ content: string; cosine_similarity: number }>,
  ragDocs: Array<{ content_preview: string; chunk_type: string }>
): string {
  const knowledgeContext = similarPatches.length > 0
    ? `\nSIMILAR PAST FIXES (cosine similarity):\n${similarPatches.slice(0, 3).map(p =>
        `- [${(p.cosine_similarity * 100).toFixed(1)}%] ${p.content.substring(0, 150)}`
      ).join('\n')}`
    : '';

  const ragContext = ragDocs.length > 0
    ? `\nKNOWLEDGE BASE (${ragDocs.map(d => d.chunk_type).join(', ')}):\n${ragDocs.slice(0, 2).map(d =>
        `- ${d.content_preview.substring(0, 100)}`
      ).join('\n')}`
    : '';

  return `You are a TypeScript/Svelte expert. Fix this error by providing ONLY valid code.

ERROR: ${error.code}: ${error.message}

CURRENT FILE:
\`\`\`typescript
// IMPORTS:
${fileSummary.imports.slice(0, 5).join('\n')}
// EXPORTS:
${fileSummary.exports.slice(0, 3).join('\n')}
// CONTENT:
${fileSummary.first_30_lines.substring(0, 800)}
\`\`\`
${knowledgeContext}
${ragContext}

INSTRUCTIONS:
1. Output ONLY the corrected TypeScript/Svelte code
2. Do NOT include explanations or markdown
3. The output must be valid code that can directly replace the file content
4. If you cannot fix it, output the original code unchanged

CORRECTED CODE:`;
}

// Validate if output is code
function validateCodeOutput(output: string): { isValid: boolean; extracted: string | null } {
  const nonCodePatterns = [
    /^#\s+/m, /^The\s+error\s+/im, /^This\s+file\s+/im,
    /^To\s+fix\s+this/im, /^I\s+cannot\s+/im, /^Unfortunately/im,
    /No\s+code\s+fix\s+needed/im, /trigger\s+a\s+full\s+rebuild/im
  ];

  const isExplanatory = nonCodePatterns.some(p => p.test(output));

  const hasCodeIndicators =
    output.includes('import ') || output.includes('export ') ||
    output.includes('function ') || output.includes('const ') ||
    output.includes('interface ') || output.includes('<script');

  if (isExplanatory || !hasCodeIndicators) {
    return { isValid: false, extracted: null };
  }

  // Extract from markdown blocks if present
  const codeBlockMatch = output.match(/```(?:typescript|ts|javascript|js|svelte)?\s*([\s\S]*?)\s*```/);
  const extracted = codeBlockMatch ? codeBlockMatch[1].trim() : output.trim();

  return { isValid: true, extracted };
}

// Main function
async function generateDataset() {
  console.log('🔄 Generating Recommendations Dataset\n');

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Fetch error clusters with file paths
  const clusters = await sql`
    SELECT
      ec.cluster_id,
      ec.error_code,
      ec.message,
      ec.file_path,
      COALESCE(es.route_path, '') as route_path,
      ec.count,
      COALESCE(es.risk_level, 'medium') as risk_level,
      es.patch
    FROM error_cluster ec
    LEFT JOIN error_suggestions es ON ec.cluster_id::text = es.cluster_id::text
    WHERE ec.file_path IS NOT NULL
      AND ec.file_path != ''
      AND ec.file_path NOT LIKE '%/__non_route__%'
    ORDER BY ec.count DESC
    LIMIT 100
  `;

  console.log(`📊 Processing ${clusters.length} error clusters\n`);

  const entries: RecommendationEntry[] = [];

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i] as any;
    console.log(`   Processing ${i + 1}/${clusters.length}: ${cluster.error_code}`);

    // Resolve file path
    const filePath = path.isAbsolute(cluster.file_path)
      ? cluster.file_path
      : path.join(process.cwd(), 'src', cluster.file_path);

    // Summarize file
    const fileSummary = await summarizeFile(filePath);

    // Generate embedding for error
    const errorText = `${cluster.error_code}: ${cluster.message}`;
    const embedding = await generateEmbedding(errorText);

    // Search similar patches in Qdrant
    const similarPatches = await searchSimilarPatches(embedding, 10);

    // Query RAG documents from PostgreSQL
    const ragDocs = await queryKnowledgeBase(embedding);

    // Determine complexity
    const complexity = getComplexity(cluster.error_code, cluster.message);

    // Build LLM prompt
    const prompt = buildPrompt(
      { code: cluster.error_code, message: cluster.message },
      fileSummary,
      similarPatches,
      ragDocs
    );

    // Calculate priority (1-10 inverse ranking)
    const topSimilarity = similarPatches[0]?.cosine_similarity || 0;
    const priority = calculatePriority(
      cluster.error_code,
      cluster.risk_level,
      topSimilarity,
      ragDocs.length > 0
    );

    // Validate existing patch if any
    const patchValidation = cluster.patch
      ? validateCodeOutput(cluster.patch)
      : { isValid: false, extracted: null };

    // Create entry
    const entry: RecommendationEntry = {
      id: cluster.cluster_id,
      timestamp: new Date().toISOString(),
      error: {
        code: cluster.error_code,
        message: cluster.message.substring(0, 500),
        file_path: cluster.file_path,
        route_path: cluster.route_path || '',
        cluster_id: cluster.cluster_id
      },
      file_summary: fileSummary,
      knowledge_base: {
        similar_patches: similarPatches,
        rag_documents: ragDocs
      },
      llm_input: {
        prompt,
        context_files: [],
        model_used: complexity === 'complex' ? 'gemini-2.0-flash-exp' : 'gemma3-legal:latest',
        complexity
      },
      llm_output: {
        raw_response: cluster.patch || '',
        is_valid_code: patchValidation.isValid,
        extracted_patch: patchValidation.extracted
      },
      recommendation: {
        action: patchValidation.isValid ? 'apply_patch' : 'regenerate_patch',
        priority,
        confidence: topSimilarity,
        strategy: complexity === 'complex' ? 'gemini_with_rag' : 'gemma_with_cache'
      }
    };

    entries.push(entry);
  }

  // Write JSONL
  const jsonlContent = entries.map(e => JSON.stringify(e)).join('\n');
  await fs.writeFile(DATASET_FILE, jsonlContent);

  console.log(`\n✅ Dataset generated: ${DATASET_FILE}`);
  console.log(`   Total entries: ${entries.length}`);
  console.log(`   Valid patches: ${entries.filter(e => e.llm_output.is_valid_code).length}`);
  console.log(`   High priority (1-3): ${entries.filter(e => e.recommendation.priority <= 3).length}`);
  console.log(`   Complex errors: ${entries.filter(e => e.llm_input.complexity === 'complex').length}`);

  // Also save summary stats
  const statsFile = path.join(OUTPUT_DIR, `recommendations-stats-${Date.now()}.json`);
  await fs.writeFile(statsFile, JSON.stringify({
    generated_at: new Date().toISOString(),
    total_entries: entries.length,
    valid_patches: entries.filter(e => e.llm_output.is_valid_code).length,
    priority_distribution: {
      high: entries.filter(e => e.recommendation.priority <= 3).length,
      medium: entries.filter(e => e.recommendation.priority > 3 && e.recommendation.priority <= 7).length,
      low: entries.filter(e => e.recommendation.priority > 7).length
    },
    complexity_distribution: {
      simple: entries.filter(e => e.llm_input.complexity === 'simple').length,
      complex: entries.filter(e => e.llm_input.complexity === 'complex').length
    },
    avg_cosine_similarity: entries.reduce((sum, e) => sum + e.recommendation.confidence, 0) / entries.length
  }, null, 2));

  console.log(`   Stats saved: ${statsFile}`);

  await redis.quit();
  await sql.end();
}

generateDataset().catch(console.error);
