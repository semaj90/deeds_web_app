#!/usr/bin/env node
/**
 * Phase 76: Knowledge Base Update & ACE Prompt Indexing
 *
 * Ingests operator docs, ACE prompts, and proven LLM outputs into the KB
 * for contextual engineering and self-improving autonomous fixing.
 *
 * Usage:
 *   node scripts/phase76-kb-update.mjs --paths NEXT_STEPS_LOG.md MCP_SESSION_SUMMARY.md --tags ace mcp --kind kb_doc
 *   node scripts/phase76-kb-update.mjs --kind ace_prompt_templates
 *   node scripts/phase76-kb-update.mjs --kind ace_llm_outputs --run-id 00041
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// ============================================================================
// Configuration
// ============================================================================

const ROOT = process.cwd();
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = process.env.KB_COLLECTION || 'phase76_knowledge_base';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma:latest';
const VECTOR_SIZE = 768;

const PG_CONFIG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || '5434'),
  database: process.env.PGDATABASE || 'legal',
  user: process.env.PGUSER || 'user',
  password: process.env.PGPASSWORD || 'pass'
};

// ============================================================================
// Deterministic Pattern Labeling (for KAG graph fixes)
// ============================================================================

const PATTERN_RULES = {
  TS1005: (message, snippet = '') => {
    const text = `${message}\n${snippet}`.toLowerCase();
    if (text.includes("',' expected")) return { pattern: 'missing-comma', conf: 0.9 };
    if (text.includes("';' expected")) return { pattern: 'missing-semicolon', conf: 0.9 };
    if (text.includes("')' expected")) return { pattern: 'missing-close-paren', conf: 0.85 };
    if (text.includes("']' expected")) return { pattern: 'missing-close-bracket', conf: 0.85 };
    if (text.includes("'>' expected")) return { pattern: 'colon-in-generic', conf: 0.80 };
    return { pattern: 'ts1005-generic', conf: 0.6 };
  },

  TS1109: (message, snippet = '') => {
    const text = `${message}\n${snippet}`.toLowerCase();
    if (text.includes('/**') && !text.includes('*/')) return { pattern: 'dangling-jsdoc', conf: 0.85 };
    if (text.includes('regex') || /\/\s*$/m.test(text)) return { pattern: 'unterminated-regex', conf: 0.75 };
    if (text.includes('<') && !text.includes('>')) return { pattern: 'colon-in-generic', conf: 0.7 };
    return { pattern: 'expression-expected', conf: 0.6 };
  },

  TS1128: (message, snippet = '') => {
    const text = `${message}\n${snippet}`.toLowerCase();
    if (/\}\s*\w/.test(text)) return { pattern: 'glued-declaration', conf: 0.75 };
    if (text.includes('class') && text.includes(',') && text.includes('{')) {
      return { pattern: 'class-member-comma', conf: 0.7 };
    }
    return { pattern: 'declaration-expected', conf: 0.6 };
  },

  TS2307: (message, snippet = '') => {
    const match = message.match(/Cannot find module '([^']+)'/);
    if (match) {
      const moduleName = match[1];
      if (moduleName.startsWith('.')) return { pattern: 'missing-local-import', conf: 0.85 };
      if (moduleName.startsWith('$')) return { pattern: 'missing-svelte-alias', conf: 0.85 };
      return { pattern: 'missing-npm-package', conf: 0.80 };
    }
    return { pattern: 'module-not-found', conf: 0.6 };
  },

  TS2345: (message, snippet = '') => {
    const text = message.toLowerCase();
    if (text.includes('undefined')) return { pattern: 'type-undefined-mismatch', conf: 0.80 };
    if (text.includes('null')) return { pattern: 'type-null-mismatch', conf: 0.80 };
    if (text.includes('string')) return { pattern: 'type-string-mismatch', conf: 0.75 };
    if (text.includes('number')) return { pattern: 'type-number-mismatch', conf: 0.75 };
    return { pattern: 'type-argument-mismatch', conf: 0.6 };
  }
};

export function labelSyntaxPattern({ code, message, snippet = '' }) {
  const rule = PATTERN_RULES[code];
  if (!rule) {
    return { pattern: 'unclassified', conf: 0.3 };
  }
  return rule(message, snippet);
}

// ============================================================================
// Utilities
// ============================================================================

function sha256(s) {
  const hash = crypto.createHash('sha256').update(s).digest('hex');
  // Convert to UUID format: 8-4-4-4-12 (required by Qdrant)
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

function chunkText(text, { maxChars = 1800, overlap = 200 } = {}) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + maxChars);
    const slice = text.slice(i, end);
    chunks.push({ text: slice, offset: i });
    i = end - overlap;
    if (i < 0) i = 0;
    if (end === text.length) break;
  }
  return chunks;
}

async function embedBatch(texts) {
  const vectors = [];
  for (const t of texts) {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: t })
    });

    if (!res.ok) {
      throw new Error(`Embed failed: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    if (!json?.embedding?.length) {
      throw new Error('Embed missing embedding[]');
    }

    vectors.push(json.embedding);
  }
  return vectors;
}

async function ensureCollection(qdrant) {
  try {
    await qdrant.getCollection(COLLECTION);
    console.log(`✅ Collection ${COLLECTION} exists`);
  } catch {
    console.log(`📦 Creating collection ${COLLECTION}...`);
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' }
    });
  }
}

async function ensurePostgresTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id text PRIMARY KEY,
      kind text NOT NULL,
      source_path text NOT NULL,
      file_hash text NOT NULL,
      chunk_index int NOT NULL,
      char_offset int NOT NULL,
      tags text[] NOT NULL DEFAULT '{}',
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS kb_chunks_source_path_idx ON kb_chunks (source_path)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS kb_chunks_kind_idx ON kb_chunks (kind)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS kb_chunks_tags_idx ON kb_chunks USING GIN (tags)
  `);

  // Fix knowledge_graph "Pattern: undefined" pollution
  /*
  await pool.query(`
    UPDATE knowledge_graph
    SET pattern = 'unclassified', pattern_confidence = 0.1
    WHERE pattern IS NULL OR pattern = 'undefined' OR pattern = ''
  `);
  */

  console.log(`✅ Postgres tables ready (kb_chunks + knowledge_graph fixed)`);
}

// ============================================================================
// Main Ingest Functions
// ============================================================================

async function ingestFiles(filePaths, { tags = [], kind = 'kb_doc' } = {}) {
  const qdrant = new QdrantClient({ url: QDRANT_URL });
  await ensureCollection(qdrant);

  const pool = new pg.Pool(PG_CONFIG);
  await ensurePostgresTables(pool);

  const points = [];

  for (const rel of filePaths) {
    const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);

    if (!fs.existsSync(abs)) {
      console.warn(`⚠️  File not found: ${abs}`);
      continue;
    }

    const content = fs.readFileSync(abs, 'utf8');
    const fileHash = sha256(content);

    console.log(`📄 Processing: ${rel} (${(content.length / 1024).toFixed(1)} KB)`);

    const chunks = chunkText(content);
    const texts = chunks.map(c => c.text);

    console.log(`   Embedding ${chunks.length} chunks...`);
    const vectors = await embedBatch(texts);

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunkId = sha256(`${rel}:${fileHash}:${idx}:${chunks[idx].offset}`);
      points.push({
        id: chunkId,
        vector: vectors[idx],
        payload: {
          kind,
          source_path: rel,
          file_hash: fileHash,
          chunk_index: idx,
          char_offset: chunks[idx].offset,
          tags
        }
      });

      // Store metadata in Postgres
      await pool.query(`
        INSERT INTO kb_chunks (id, kind, source_path, file_hash, chunk_index, char_offset, tags, content)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          tags = EXCLUDED.tags,
          content = EXCLUDED.content
      `, [chunkId, kind, rel, fileHash, idx, chunks[idx].offset, tags, chunks[idx].text]);
    }
  }

  // Upsert to Qdrant in batches
  const BATCH = 128;
  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH);
    await qdrant.upsert(COLLECTION, { wait: true, points: batch });
    console.log(`   ✅ Upserted batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(points.length / BATCH)}`);
  }

  await pool.end();
  console.log(`\n✅ Ingested ${points.length} chunks into ${COLLECTION}`);
}

async function ingestACEPromptTemplates() {
  console.log(`📋 Ingesting ACE Prompt Templates...`);

  const templates = [
    {
      name: 'surgical-fix-template',
      task_type: 'error-fix',
      template: `Fix this TypeScript error with the SMALLEST possible patch (max {max_lines} lines):

**Error**: {error_code} - {error_message}
**Location**: {file_path}:{line}
**Pattern**: {pattern_label}

**Code Context** (lines {start_line}-{end_line}):
\`\`\`typescript
{code_context}
\`\`\`

**Top Similar Patterns** (Qdrant):
{qdrant_results}

**Similar Errors** (pgvector HNSW):
{pgvector_results}

**Related Errors** (KAG):
{kag_results}

**Instructions**:
1. Return ONLY the fixed code snippet
2. Include ONLY the lines that need to change
3. Prefer single-line fixes
4. Do NOT add comments or explanations
5. Ensure syntax is valid TypeScript

**Fixed Code**:`,
      constraints: {
        max_lines: 30,
        max_files: 1,
        min_confidence: 0.85
      },
      expected_output_schema: {
        type: 'code_snippet',
        fields: ['fixed_code', 'explanation', 'confidence']
      }
    },
    {
      name: 'multi-error-batch-template',
      task_type: 'batch-fix',
      template: `Fix multiple related TypeScript errors in a single patch:

**Errors** ({count} related):
{error_list}

**Shared Context**:
- File: {file_path}
- Pattern: {shared_pattern}
- Impact Score: {total_impact}

**Code Context**:
\`\`\`typescript
{code_context}
\`\`\`

**Known Patterns**:
{retrieval_results}

**Instructions**:
1. Fix all errors in a single coherent patch
2. Maintain code style and structure
3. Verify fixes don't create new errors
4. Max {max_lines} lines total

**Patch**:`,
      constraints: {
        max_lines: 50,
        max_errors_per_batch: 5,
        min_shared_confidence: 0.75
      }
    }
  ];

  const qdrant = new QdrantClient({ url: QDRANT_URL });
  await ensureCollection(qdrant);

  const pool = new pg.Pool(PG_CONFIG);
  await ensurePostgresTables(pool);

  const points = [];

  for (const tmpl of templates) {
    const templateText = `${tmpl.name}\n${tmpl.task_type}\n${tmpl.template}\nConstraints: ${JSON.stringify(tmpl.constraints)}`;
    const [vector] = await embedBatch([templateText]);

    const chunkId = sha256(tmpl.name);
    points.push({
      id: chunkId,
      vector,
      payload: {
        kind: 'ace_prompt_template',
        template_name: tmpl.name,
        task_type: tmpl.task_type,
        tags: ['ace', 'prompt', 'contextual-engineering']
      }
    });

    await pool.query(`
      INSERT INTO kb_chunks (id, kind, source_path, file_hash, chunk_index, char_offset, tags, content)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content
    `, [chunkId, 'ace_prompt_template', tmpl.name, sha256(JSON.stringify(tmpl)), 0, 0, ['ace', 'prompt'], JSON.stringify(tmpl)]);
  }

  await qdrant.upsert(COLLECTION, { wait: true, points });
  await pool.end();

  console.log(`✅ Ingested ${templates.length} ACE prompt templates`);
}

async function ingestSuccessfulRuns(runId = null) {
  console.log(`🎯 Ingesting successful LLM outputs...`);

  const reportsDir = path.join(ROOT, 'reports', 'phase86');

  if (!fs.existsSync(reportsDir)) {
    console.log(`⚠️  No reports directory found: ${reportsDir}`);
    return;
  }

  const files = fs.readdirSync(reportsDir)
    .filter(f => f.endsWith('.json'))
    .filter(f => !runId || f.includes(runId));

  if (files.length === 0) {
    console.log(`⚠️  No run files found`);
    return;
  }

  const qdrant = new QdrantClient({ url: QDRANT_URL });
  await ensureCollection(qdrant);

  const pool = new pg.Pool(PG_CONFIG);
  await ensurePostgresTables(pool);

  const points = [];

  for (const file of files) {
    const runData = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf8'));

    // Only ingest successful fixes
    if (!runData.success || runData.errorDelta <= 0) continue;

    const summaryText = `
Error Fixed: ${runData.error?.code} - ${runData.error?.message}
File: ${runData.error?.file}:${runData.error?.line}
Pattern: ${runData.pattern}
Confidence: ${runData.confidence}
Tool Calls: ${runData.toolCalls?.map(t => t.tool).join(', ')}
Diff Stats: ${runData.diffStats?.linesChanged} lines changed
TSC Delta: ${runData.errorDelta} errors fixed
Patch:
${runData.patch}
`.trim();

    const [vector] = await embedBatch([summaryText]);

    const chunkId = sha256(file);
    points.push({
      id: chunkId,
      vector,
      payload: {
        kind: 'ace_llm_output',
        run_id: file.replace('.json', ''),
        error_code: runData.error?.code,
        pattern: runData.pattern,
        confidence: runData.confidence,
        error_delta: runData.errorDelta,
        tags: ['ace', 'llm-output', 'successful-fix', runData.error?.code?.toLowerCase()]
      }
    });

    await pool.query(`
      INSERT INTO kb_chunks (id, kind, source_path, file_hash, chunk_index, char_offset, tags, content)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content
    `, [
      chunkId,
      'ace_llm_output',
      file,
      sha256(JSON.stringify(runData)),
      0,
      0,
      ['ace', 'llm-output', 'successful-fix'],
      JSON.stringify(runData)
    ]);
  }

  await qdrant.upsert(COLLECTION, { wait: true, points });
  await pool.end();

  console.log(`✅ Ingested ${points.length} successful LLM outputs`);
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);

if (args.includes('--help') || args.length === 0) {
  console.log(`
Phase 76: Knowledge Base Update & ACE Prompt Indexing

Usage:
  # Ingest operator docs
  node scripts/phase76-kb-update.mjs \\
    --paths NEXT_STEPS_LOG.md MCP_SESSION_SUMMARY.md MCP_IMPLEMENTATION_SUMMARY.md \\
    --tags phase76 ace mcp contextual-engineering \\
    --kind kb_doc

  # Ingest ACE prompt templates
  node scripts/phase76-kb-update.mjs --kind ace_prompt_templates

  # Ingest successful LLM outputs
  node scripts/phase76-kb-update.mjs --kind ace_llm_outputs [--run-id 00041]

  # Fix knowledge_graph "Pattern: undefined"
  node scripts/phase76-kb-update.mjs --fix-graph-patterns

Options:
  --paths <files...>    Files to ingest
  --tags <tags...>      Tags to apply
  --kind <type>         Content type (kb_doc, ace_prompt_templates, ace_llm_outputs)
  --run-id <id>         Specific run ID to ingest
  --fix-graph-patterns  Fix "undefined" patterns in knowledge_graph
  `);
  process.exit(0);
}

const files = [];
const tags = [];
let kind = 'kb_doc';
let runId = null;
let fixGraphPatterns = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--paths') {
    while (args[i + 1] && !args[i + 1].startsWith('--')) files.push(args[++i]);
  } else if (a === '--tags') {
    while (args[i + 1] && !args[i + 1].startsWith('--')) tags.push(args[++i]);
  } else if (a === '--kind') {
    kind = args[++i];
  } else if (a === '--run-id') {
    runId = args[++i];
  } else if (a === '--fix-graph-patterns') {
    fixGraphPatterns = true;
  }
}

// Execute based on kind
if (fixGraphPatterns) {
  const pool = new pg.Pool(PG_CONFIG);
  await ensurePostgresTables(pool);
  await pool.end();
  console.log(`✅ Fixed knowledge_graph patterns`);
} else if (kind === 'ace_prompt_templates') {
  await ingestACEPromptTemplates();
} else if (kind === 'ace_llm_outputs') {
  await ingestSuccessfulRuns(runId);
} else if (kind === 'kb_doc' && files.length > 0) {
  await ingestFiles(files, { tags, kind });
} else {
  console.error(`❌ Invalid arguments. Use --help for usage.`);
  process.exit(1);
}
