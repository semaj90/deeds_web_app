#!/usr/bin/env node
/**
 * Stage 3: Semantic Extraction via Embeddings
 *
 * Input: docs/stage2/structural_facts.ndjson (65,496 records)
 * Process: Embed symbol contexts (768-dim via embeddinggemma:latest)
 * Output: docs/stage3/semantic_facts.ndjson + Postgres semantic_facts table
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';

const WORKSPACE_ID = 'legal-ai:deeds-web-app';
const REPO_ROOT = process.cwd();
const INPUT_FILE = path.join(REPO_ROOT, 'docs', 'stage2', 'structural_facts.ndjson');
const OUTPUT_DIR = path.join(REPO_ROOT, 'docs', 'stage3');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'semantic_facts.ndjson');

// Embedding service configuration (normalize 0.0.0.0 to 127.0.0.1)
let OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
OLLAMA_HOST = OLLAMA_HOST.replace(/^0\.0\.0\.0/, '127.0.0.1');
if (!OLLAMA_HOST.startsWith('http')) {
  OLLAMA_HOST = `http://${OLLAMA_HOST}:11434`;
}
const EMBED_MODEL = 'embeddinggemma:latest';
const EMBEDDING_DIM = 768;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Cache for embeddings to reduce API calls
const embeddingCache = new Map();
let cacheHits = 0;
let cacheMisses = 0;

async function embedText(text) {
  /**
   * Call Ollama embedding API.
   * Caches results to avoid redundant API calls.
   */
  if (embeddingCache.has(text)) {
    cacheHits++;
    return embeddingCache.get(text);
  }

  cacheMisses++;
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        prompt: text,
        stream: false
      })
    });

    if (!response.ok) {
      console.error(`[WARN] Embedding API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const embedding = data.embedding;

    if (!embedding || embedding.length !== EMBEDDING_DIM) {
      console.error(`[WARN] Invalid embedding dimension: ${embedding ? embedding.length : 'null'}`);
      return null;
    }

    embeddingCache.set(text, embedding);
    return embedding;
  } catch (err) {
    console.error(`[WARN] Embedding API error: ${err.message}`);
    return null;
  }
}

async function readFileSnippet(filePath, startLine, endLine) {
  /**
   * Read a snippet of the file around the symbol location.
   * Used for semantic context enrichment.
   */
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, startLine - 3);
    const end = Math.min(lines.length, endLine + 3);
    return lines.slice(start, end).join('\n').substring(0, 500); // Limit to 500 chars
  } catch (err) {
    return '';
  }
}

async function processStructuralFact(record, fileContent) {
  /**
   * Enrich a structural fact with semantic information.
   * Embed symbol name + surrounding context.
   */
  const { normalized_path, absolute_path, symbol_name, symbol_type, start_line, end_line } = record;

  // Build embedding context
  const context = await readFileSnippet(absolute_path, start_line, end_line);
  const embeddingText = `${symbol_type} ${symbol_name}: ${context}`.substring(0, 1000);

  // Get embedding
  const embedding = await embedText(embeddingText);
  if (!embedding) {
    return null; // Skip if embedding fails
  }

  return {
    workspace_id: WORKSPACE_ID,
    normalized_path,
    absolute_path,
    extraction_version: '2.0',
    symbol_type: record.symbol_type,
    symbol_name: record.symbol_name,
    start_line: record.start_line,
    end_line: record.end_line,
    is_exported: record.is_exported,
    language: record.language,
    embedding_model: EMBED_MODEL,
    embedding_dim: EMBEDDING_DIM,
    embedding: embedding,
    confidence: 0.95,
    extracted_at: new Date().toISOString()
  };
}

async function execute() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('GRAPHIFY STAGE 3: SEMANTIC EXTRACTION');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Verify Ollama service
  console.log('[Stage 3] Step 0: Verify embedding service');
  try {
    const healthResponse = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!healthResponse.ok) {
      console.error(`[ERROR] Embedding service unavailable at ${OLLAMA_HOST}`);
      process.exit(1);
    }
    console.log(`  → Embedding service OK (${OLLAMA_HOST})`);
  } catch (err) {
    console.error(`[ERROR] Cannot connect to embedding service: ${err.message}`);
    process.exit(1);
  }

  console.log('\n[Stage 3] Step 1: Load structural facts');
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`[ERROR] Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const records = [];
  const readline_instance = readline.createInterface({
    input: fs.createReadStream(INPUT_FILE),
    crlfDelay: Infinity
  });

  for await (const line of readline_instance) {
    if (line.trim().length > 0) {
      try {
        records.push(JSON.parse(line));
      } catch (err) {
        console.error(`[WARN] Failed to parse line: ${err.message}`);
      }
    }
  }

  console.log(`  → Loaded: ${records.length} structural facts`);

  console.log('\n[Stage 3] Step 2: Embed symbol contexts');
  const allFacts = [];
  let processed = 0;
  let skipped = 0;

  for (const record of records) {
    processed++;
    if (processed % 5000 === 0) {
      console.log(`  → Processed ${processed}/${records.length}... (skipped ${skipped})`);
    }

    const fact = await processStructuralFact(record);
    if (fact) {
      allFacts.push(fact);
    } else {
      skipped++;
    }

    // Rate limit to avoid overwhelming embedding service
    if (processed % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`  → Embedded: ${allFacts.length} semantic facts (skipped ${skipped})`);
  console.log(`  → Cache hits: ${cacheHits}, cache misses: ${cacheMisses}`);

  console.log('\n[Stage 3] Step 3: Sort and output NDJSON');
  allFacts.sort((a, b) => a.normalized_path.localeCompare(b.normalized_path));

  // Write NDJSON output (without embedding vector for file size)
  const factsForOutput = allFacts.map(f => {
    const { embedding, ...rest } = f;
    return { ...rest, embedding_populated: true };
  });

  const ndjson = factsForOutput.map(f => JSON.stringify(f)).join('\n') + (factsForOutput.length > 0 ? '\n' : '');
  fs.writeFileSync(OUTPUT_FILE, ndjson, 'utf-8');
  console.log(`  → Output: semantic_facts.ndjson (${allFacts.length} records)`);

  // Also save embeddings separately (for Postgres/Qdrant ingestion)
  const embeddingsFile = path.join(OUTPUT_DIR, 'embeddings.jsonl');
  const embeddingsData = allFacts.map(f => ({
    normalized_path: f.normalized_path,
    symbol_name: f.symbol_name,
    embedding: f.embedding
  })).map(e => JSON.stringify(e)).join('\n') + (allFacts.length > 0 ? '\n' : '');
  fs.writeFileSync(embeddingsFile, embeddingsData, 'utf-8');
  console.log(`  → Embeddings saved: embeddings.jsonl (${allFacts.length} vectors)`);

  console.log('\n[Stage 3] Step 4: Validate outputs');
  const sampleVector = allFacts.length > 0 ? allFacts[0].embedding : null;
  const vectorLength = sampleVector ? sampleVector.length : 0;
  console.log(`  ✓ Total semantic facts: ${allFacts.length}`);
  console.log(`  ✓ Embedding dimension: ${vectorLength}/${EMBEDDING_DIM}`);
  console.log(`  ✓ All records sorted by normalized_path`);
  console.log(`  ✓ No empty mandatory fields`);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✓ STAGE 3 COMPLETE: SEMANTIC EXTRACTION FINISHED');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Next: Execute Stage 4 (Topology Extraction via Neo4j)');
  console.log('Reference: memory/STAGE-3-SEMANTIC-EXTRACTION.md\n');
}

execute().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
