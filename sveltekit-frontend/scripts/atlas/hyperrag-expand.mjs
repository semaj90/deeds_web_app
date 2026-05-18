#!/usr/bin/env node
/**
 * hyperrag-expand.mjs
 *
 * Stage 8 of the HyperRAG 4D Topology Knowledge Layer.
 * Reads an NDJSON chunk file and expands each record with 3 diverse multi-query 
 * technical prompt variations. This optimizes vector recall and ensures deep
 * lexical-semantic coverage.
 *
 * Usage:
 *   node scripts/atlas/hyperrag-expand.mjs \
 *     --input tmp/chunks/parents-corpus-synthesized.ndjson \
 *     --out tmp/chunks/parents-corpus-expanded.ndjson
 *
 * Env:
 *   OLLAMA_URL    default http://localhost:11434
 */

import fs      from 'node:fs';
import path    from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv       = process.argv.slice(2);
const inputI     = argv.indexOf('--input');
const outI       = argv.indexOf('--out');
const DRY_RUN    = argv.includes('--dry-run');
const VERBOSE    = argv.includes('--verbose');

const INPUT_PATH = inputI >= 0 ? argv[inputI + 1] : null;
const OUT_PATH   = outI   >= 0 ? argv[outI + 1]   : null;

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const EXPAND_MODEL = process.env.EXPAND_MODEL ?? 'gemma:2b';

// ── Heuristic Fallback Generator ─────────────────────────────────────────────
function generateHeuristicExpansions(text, tags, featureKey) {
  const cleanKey = featureKey || 'system component';
  
  // Variation 1: Operational / Architectural Query
  const v1 = `How does the ${cleanKey} module integrate with the Deeds platform architecture, and what are its core reactivity primitives?`;
  
  // Variation 2: Diagnostics / Debugging Query
  const v2 = `What are the primary error paths, TypeScript type constraints, and schema drifts associated with ${cleanKey}?`;
  
  // Variation 3: Dataflow / Dependency Query
  const v3 = `Show the dependency routing and file relationship paths involving ${cleanKey} across Drizzle, Qdrant, and Redis caches.`;
  
  return [v1, v2, v3];
}

// ── LLM Multi-Query Expansion ────────────────────────────────────────────────
async function expandViaLLM(text, featureKey) {
  const prompt = `Given the following technical code notes or documentation about the feature "${featureKey}", generate exactly 3 diverse, distinct technical search queries that a developer might ask to locate this information. 
Do not include any introductory remarks, commentary, or numbered lists. Output ONLY the 3 queries, each on a new line.

TECHNICAL CONTEXT:
${text.slice(0, 800)}

3 SEARCH QUERIES:`;

  try {
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EXPAND_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.3 }
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error(`Ollama expand error ${r.status}`);
    const data = await r.json();
    const queries = data.response
      .split('\n')
      .map(q => q.replace(/^\d+\.\s*/, '').trim())
      .filter(q => q.length > 10);
    
    if (queries.length >= 3) return queries.slice(0, 3);
  } catch {
    // Fail silent and use heuristic fallback
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
function deriveFeatureKey(tags, sourcePath) {
  const featureTags = (tags ?? []).filter(t => t.startsWith('feature:')).map(t => t.replace('feature:', ''));
  if (featureTags.length > 0) return featureTags[0];
  return path.basename(sourcePath ?? 'unknown').replace(/\.[^.]+$/, '');
}

async function main() {
  if (!INPUT_PATH) {
    console.error('[hyperrag-expand] --input required');
    process.exit(1);
  }

  const inputResolved = path.isAbsolute(INPUT_PATH) ? INPUT_PATH : path.join(ROOT, INPUT_PATH);
  const lines   = fs.readFileSync(inputResolved, 'utf8').trim().split('\n').filter(Boolean);
  const records = lines.map(l => JSON.parse(l));

  console.log(`[hyperrag-expand] Loaded ${records.length} records from ${INPUT_PATH}`);
  console.log(`[hyperrag-expand] dry=${DRY_RUN}  ollama=${OLLAMA_URL}`);

  const expanded = [];
  let llmCount = 0;
  let fallbackCount = 0;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const featureKey = deriveFeatureKey(rec.tags, rec.source_path);
    
    let queries = null;
    if (!DRY_RUN) {
      queries = await expandViaLLM(rec.text ?? '', featureKey);
    }
    
    if (queries) {
      llmCount++;
    } else {
      queries = generateHeuristicExpansions(rec.text ?? '', rec.tags ?? [], featureKey);
      fallbackCount++;
    }

    if (VERBOSE || DRY_RUN) {
      console.log(`\n[${i}] Feature: ${featureKey}`);
      queries.forEach((q, idx) => console.log(`  Query ${idx + 1}: ${q}`));
    } else {
      process.stdout.write(`\r[hyperrag-expand] ${i + 1}/${records.length} processed (llm=${llmCount}, heuristic=${fallbackCount})  `);
    }

    expanded.push({
      ...rec,
      expanded_queries: queries
    });
  }

  console.log(`\n[hyperrag-expand] Multi-query expansion complete.`);

  if (DRY_RUN) {
    console.log('[hyperrag-expand] DRY RUN — sample record:');
    console.log(JSON.stringify(expanded[0] ?? {}, null, 2));
    return;
  }

  const ndjson = expanded.map(r => JSON.stringify(r)).join('\n') + '\n';

  if (OUT_PATH) {
    const outResolved = path.isAbsolute(OUT_PATH) ? OUT_PATH : path.join(ROOT, OUT_PATH);
    fs.mkdirSync(path.dirname(outResolved), { recursive: true });
    fs.writeFileSync(outResolved, ndjson, 'utf8');
    console.log(`[hyperrag-expand] ✅ Wrote ${expanded.length} records → ${OUT_PATH}`);
  } else {
    process.stdout.write(ndjson);
  }
}

main().catch(err => {
  console.error('[hyperrag-expand]', err.message);
  process.exit(1);
});
