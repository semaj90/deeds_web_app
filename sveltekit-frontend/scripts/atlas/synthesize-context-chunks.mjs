#!/usr/bin/env node
/**
 * synthesize-context-chunks.mjs
 *
 * Stage 7 (final) of the ACE Feature Context Matrix pipeline.
 * Calls Gemma4 (via TurboQuant :8090 → Ollama :11434 fallback) to synthesize
 * a concise action-oriented summary for each feature card group.
 *
 * Input:  NDJSON chunks (post-embed stage, optionally post-rg-matrix)
 * Output: NDJSON with an added `synthesis` field per feature group,
 *         written to --out or stdout.
 *
 * The synthesis prompt asks:
 *   "Given these code/doc/error chunks about {featureKey}, summarize:
 *    1. What is this feature?
 *    2. What errors/issues are present?
 *    3. What files are involved?
 *    4. What is the recommended next action?"
 *
 * Synthesized records are also upserted to Redis under:
 *   ace:ctx:{featureKey}   (synthesis summary + chunk_ids, TTL 24h)
 *
 * Usage:
 *   node scripts/atlas/synthesize-context-chunks.mjs \
 *     --input tmp/chunks/error-context.ndjson \
 *     --out tmp/chunks/error-context-synthesized.ndjson
 *   node scripts/atlas/synthesize-context-chunks.mjs \
 *     --input tmp/chunks/notes.ndjson --dry-run
 *
 * Env:
 *   TURBO_URL   default http://localhost:8090  (TurboQuant, chat-only)
 *   OLLAMA_URL  default http://localhost:11434 (fallback)
 *   REDIS_URL   default redis://localhost:6379
 *   REDIS_TTL   default 86400
 */

import fs      from 'node:fs';
import path    from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis   from 'ioredis';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv       = process.argv.slice(2);
const inputI     = argv.indexOf('--input');
const outI       = argv.indexOf('--out');
const modelI     = argv.indexOf('--model');
const DRY_RUN    = argv.includes('--dry-run');
const NO_REDIS   = argv.includes('--no-redis');
const VERBOSE    = argv.includes('--verbose');

const INPUT_PATH = inputI >= 0 ? argv[inputI + 1] : null;
const OUT_PATH   = outI   >= 0 ? argv[outI + 1]   : null;
const MODEL      = modelI >= 0 ? argv[modelI + 1] : 'gemma4-legal-vlm:latest';

const TURBO_URL  = process.env.TURBO_URL  ?? 'http://localhost:8090';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const REDIS_URL  = process.env.REDIS_URL  ?? 'redis://localhost:6379';
const REDIS_TTL  = Number(process.env.REDIS_TTL ?? '86400');

// ── LLM probe ─────────────────────────────────────────────────────────────────
let turboquantAvailable = false;

async function checkTurboQuant() {
  try {
    const r = await fetch(`${TURBO_URL}/health`, { signal: AbortSignal.timeout(2000) });
    turboquantAvailable = r.ok;
  } catch {
    turboquantAvailable = false;
  }
}

async function chatCompletion(systemPrompt, userPrompt) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt },
  ];

  const url   = turboquantAvailable ? `${TURBO_URL}/v1/chat/completions` : `${OLLAMA_URL}/v1/chat/completions`;
  const model = turboquantAvailable ? MODEL : 'gemma3-legal:latest';

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 400,
      temperature: 0.2,
      stream: false,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── Feature grouping ──────────────────────────────────────────────────────────
function deriveFeatureKey(tags, sourcePath) {
  const featureTags = (tags ?? []).filter(t => t.startsWith('feature:')).map(t => t.replace('feature:', ''));
  if (featureTags.length > 0) return featureTags[0];
  return path.basename(sourcePath ?? 'unknown').replace(/\.[^.]+$/, '');
}

function groupByFeature(records) {
  const groups = new Map();
  for (const rec of records) {
    const key = deriveFeatureKey(rec.tags, rec.source_path);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rec);
  }
  return groups;
}

// ── Synthesis prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a code analysis assistant. Given code/doc/error chunks about a software feature,
produce a structured 4-part summary:
1. Feature description (1 sentence)
2. Errors/issues present (bullet list, or "None found")
3. Involved files (list, or "Unknown")
4. Recommended next action (1-2 sentences)
Be concise. Do not include raw code blocks. Do not repeat the chunks verbatim.`;

function buildUserPrompt(featureKey, chunks) {
  const snippets = chunks
    .slice(0, 5)
    .map((c, i) => `--- Chunk ${i + 1} (${c.source_type}, words=${c.word_count}) ---\n${c.text.slice(0, 600)}`)
    .join('\n\n');
  const filePaths = [...new Set(chunks.flatMap(c => [...(c.file_refs ?? []), ...(c.rg_paths ?? [])]))].slice(0, 10);

  return `Feature key: ${featureKey}
Tags: ${[...new Set(chunks.flatMap(c => c.tags ?? []))].join(', ')}
Related files: ${filePaths.join(', ') || 'Unknown'}
Chunks (${chunks.length} total, showing first 5):

${snippets}

Summarize this feature.`;
}

// ── Redis ─────────────────────────────────────────────────────────────────────
async function cacheCtx(redis, featureKey, synthRecord) {
  const key = `ace:ctx:${featureKey}`;
  const val = JSON.stringify({
    feature_key: synthRecord.feature_key,
    synthesis:   synthRecord.synthesis,
    chunk_ids:   synthRecord.chunk_ids,
    tags:        synthRecord.tags,
    indexed_at:  synthRecord.indexed_at,
  });
  await redis.setex(key, REDIS_TTL, val);
  return key;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!INPUT_PATH) {
    console.error('[synthesize] --input required');
    process.exit(1);
  }

  const inputResolved = path.isAbsolute(INPUT_PATH) ? INPUT_PATH : path.join(ROOT, INPUT_PATH);
  const lines   = fs.readFileSync(inputResolved, 'utf8').trim().split('\n').filter(Boolean);
  const records = lines.map(l => JSON.parse(l));

  console.log(`[synthesize] Loaded ${records.length} chunks from ${INPUT_PATH}`);

  const groups = groupByFeature(records);
  console.log(`[synthesize] Feature groups: ${groups.size}`);
  for (const [key, chunks] of groups) {
    console.log(`  ${key.padEnd(30)} ${chunks.length} chunks`);
  }

  if (DRY_RUN) {
    console.log('[synthesize] DRY RUN — would synthesize each group, cache to Redis, and write NDJSON');
    return;
  }

  await checkTurboQuant();
  console.log(`[synthesize] LLM: ${turboquantAvailable ? `TurboQuant ${TURBO_URL}` : `Ollama ${OLLAMA_URL}`}`);

  // Redis (optional)
  let redis = null;
  if (!NO_REDIS) {
    redis = new Redis(REDIS_URL, {
      lazyConnect: true, maxRetriesPerRequest: 1,
      enableOfflineQueue: false, retryStrategy: () => null,
    });
    redis.on('error', () => {});
    try {
      await redis.connect();
      await redis.ping();
    } catch {
      console.warn('[synthesize] Redis unavailable — skipping ctx cache');
      redis = null;
    }
  }

  const synthesized = [];
  let groupIdx = 0;

  for (const [featureKey, chunks] of groups) {
    groupIdx++;
    console.log(`\n[synthesize] (${groupIdx}/${groups.size}) Synthesizing: ${featureKey} (${chunks.length} chunks)`);

    let synthesis = '';
    try {
      synthesis = await chatCompletion(SYSTEM_PROMPT, buildUserPrompt(featureKey, chunks));
      if (VERBOSE) console.log(`  → ${synthesis.slice(0, 200)}`);
    } catch (err) {
      console.warn(`  [warn] synthesis failed: ${err.message}`);
      synthesis = `[synthesis unavailable: ${err.message}]`;
    }

    const allTags     = [...new Set(chunks.flatMap(c => c.tags ?? []))];
    const allFileRefs = [...new Set(chunks.flatMap(c => [...(c.file_refs ?? []), ...(c.rg_paths ?? [])]))];

    const synthRecord = {
      feature_key: featureKey,
      synthesis,
      chunk_ids:   chunks.map(c => c.chunk_id),
      tags:        allTags,
      file_refs:   allFileRefs,
      source_type: chunks[0]?.source_type ?? 'notes',
      chunk_count: chunks.length,
      indexed_at:  new Date().toISOString(),
    };

    synthesized.push(synthRecord);

    // Cache to Redis
    if (redis) {
      const key = await cacheCtx(redis, featureKey, synthRecord);
      console.log(`  → cached: ${key}`);
    }
  }

  // Write enriched original records with synthesis added
  const enriched = records.map(rec => ({
    ...rec,
    synthesis: synthesized.find(s => s.feature_key === deriveFeatureKey(rec.tags, rec.source_path))?.synthesis ?? null,
  }));

  const ndjson = enriched.map(r => JSON.stringify(r)).join('\n') + '\n';

  if (OUT_PATH) {
    const outResolved = path.isAbsolute(OUT_PATH) ? OUT_PATH : path.join(ROOT, OUT_PATH);
    fs.mkdirSync(path.dirname(outResolved), { recursive: true });
    fs.writeFileSync(outResolved, ndjson, 'utf8');
    console.log(`\n[synthesize] ✅ Wrote ${enriched.length} records → ${OUT_PATH}`);
  } else {
    process.stdout.write(ndjson);
  }

  if (redis) redis.disconnect();

  console.log(`[synthesize] ✅ Done — ${groups.size} feature groups synthesized`);
}

main().catch(err => {
  console.error('[synthesize]', err.message);
  process.exit(1);
});
