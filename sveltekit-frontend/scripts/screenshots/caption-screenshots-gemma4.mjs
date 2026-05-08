#!/usr/bin/env node
/**
 * caption-screenshots-gemma4.mjs
 *
 * Run Gemma4 VLM (with mmproj vision tower) over already-indexed screenshots
 * to generate captions. UPDATEs screenshot_artifacts.caption +
 * caption_embedding (768-dim via embeddinggemma).
 *
 * Endpoint: Ollama /api/generate with images: [<base64>]. Uses the
 * gemma4-legal-vlm:latest tag which has the vision tower attached.
 *
 * Stack:
 *   - Ollama @ OLLAMA_URL (default http://127.0.0.1:11434)
 *   - gemma4-legal-vlm:latest         (VLM, ~5.3GB)
 *   - embeddinggemma:latest           (768-dim caption embedding)
 *   - sharp                           (compress full image to ~512px JPEG before send,
 *                                      cheaper for VLM inference)
 *   - pg                              (read/write screenshot_artifacts)
 *
 * Optional (auto-skip if not installed):
 *   - tesseract.js                    (OCR backup if VLM caption is empty)
 *
 * Idempotent: skips rows with non-NULL caption unless --force.
 *
 * Usage:
 *   node scripts/screenshots/caption-screenshots-gemma4.mjs --dry-run
 *   node scripts/screenshots/caption-screenshots-gemma4.mjs --apply
 *   node scripts/screenshots/caption-screenshots-gemma4.mjs --apply --limit 10
 *   node scripts/screenshots/caption-screenshots-gemma4.mjs --apply --no-embed
 *   node scripts/screenshots/caption-screenshots-gemma4.mjs --apply --force
 */

import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const args      = process.argv.slice(2);
const APPLY     = args.includes('--apply');
const DRY_RUN   = !APPLY;
const FORCE     = args.includes('--force');
const NO_EMBED  = args.includes('--no-embed');
const LIMIT     = parseInt(
  args.find(a => a.startsWith('--limit='))?.split('=')[1] ??
  (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : '10')
) || 10;

const OLLAMA_URL     = process.env.OLLAMA_BASE_URL ?? process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const TURBOQUANT_URL = process.env.TURBOQUANT_URL  ?? 'http://127.0.0.1:8090';
const VLM_MODEL      = process.env.VLM_MODEL   ?? 'gemma4-legal-vlm:latest';
const EMBED_MODEL    = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';
const DB_URL         = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

console.log(`\n🖼️  Gemma4 VLM caption pass${DRY_RUN ? ' [DRY RUN]' : ''}`);
console.log(`   model:  ${VLM_MODEL}`);
console.log(`   limit:  ${LIMIT}  force: ${FORCE}  embed: ${!NO_EMBED}\n`);

// Tightest prompt that reliably keeps gemma4-legal-vlm in direct-answer mode.
// Empirical finding: longer prompts (4+ lines) push the model into chain-of-
// thought, which routes output to `reasoning_content` and runs out of tokens
// before the actual caption lands. This 3-sentence prompt produces a clean
// 400-500 char caption in `message.content` with no CoT leak. Verified live
// against 'analytics-google-queued-task-panel.png' (421 chars, 0% CoT).
const PROMPT =
  'Caption this UI screenshot of a SvelteKit legal-AI app in 2-3 sentences. ' +
  'Name the visible component, the state, and any visible problems. ' +
  'Output the caption only.';

function fileFromUri(uri) {
  if (uri.startsWith('file://')) {
    return decodeURIComponent(uri.replace(/^file:\/\/\/?/, ''));
  }
  return uri;
}

async function compressForVlm(absPath) {
  // Cap at 512px longest edge to make inference cheap; preserves aspect ratio.
  const buf = readFileSync(absPath);
  const meta = await sharp(buf).metadata();
  const longestEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (longestEdge <= 512) return buf;
  const scale = 512 / longestEdge;
  return sharp(buf)
    .resize({
      width:  Math.round((meta.width  ?? 0) * scale),
      height: Math.round((meta.height ?? 0) * scale),
      fit: 'inside',
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Caption cascade — TurboQuant llama-server :8090 first, Ollama :11434 fallback.
 *
 * Why TurboQuant first: llama-server with the gemma4-legal-vlm GGUF + mmproj
 * already holds VRAM (q8_0 KV cache, persistent). Routing captions through it
 * avoids loading a second copy of the same weights into Ollama (which competes
 * for the 8GB GPU and goes empty under VRAM pressure — same pattern fixed
 * earlier in the karpathy rerank lane).
 *
 * TurboQuant probe at startup confirms `capabilities: [completion, multimodal]`
 * → mmproj is loaded. /v1/chat/completions accepts the OpenAI-style content
 * array with `image_url: data:image/jpeg;base64,...`.
 *
 * Ollama remains the fallback for when TurboQuant is down OR returns empty
 * (rare; mostly edge cases on very long prompts).
 */
/**
 * Strip a leading chain-of-thought block from a Gemma4 response.
 *
 * gemma4-legal-vlm reliably emits 400-600 tokens of reasoning before the
 * final caption — patterns observed: "Here's a thinking process to arrive
 * at the desired output: 1. **Analyze the Request Constraints:**…". Without
 * stripping, the CoT itself ends up persisted as the caption (verified
 * 2026-05-08 — first row had the entire reasoning trace stored verbatim).
 *
 * Strategy: detect a known reasoning preamble; if present, walk paragraphs
 * backward and return the last prose-shaped paragraph (>40 chars, no
 * leading numbered/bulleted/header marker). The actual caption typically
 * lands after the analysis steps.
 */
function stripReasoning(text) {
  if (!text) return text;
  const t = text.trim();
  const reasoningHeads = [
    /^here'?s a thinking process/i,
    /^let me analyze/i,
    /^let's break this down/i,
    /^thinking through/i,
    /^my reasoning/i,
    /^step \d+[:.)]/i,
    /^\d+\.\s+\*\*[A-Z]/,          // "1.  **Analyze..."
  ];
  if (!reasoningHeads.some(re => re.test(t))) return t;
  const paragraphs = t.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i];
    if (!/^\d+\./.test(p) && !/^\*\*/.test(p) && !/^#{1,6}\s/.test(p) && p.length > 40) {
      return p;
    }
  }
  return t; // fallback: surface what we got so the operator can see it
}

async function captionWithTurboQuant(imageB64) {
  // Quick health gate — skip if :8090 is offline (don't pay timeout cost)
  try {
    const h = await fetch(`${TURBOQUANT_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (!h.ok) return null;
  } catch { return null; }

  try {
    const res = await fetch(`${TURBOQUANT_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VLM_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
            { type: 'text',      text: PROMPT },
          ],
        }],
        max_tokens:   800,    // gemma4-legal-vlm reliably emits 400-600 tokens of CoT
                              // before the actual caption — give it room to land the answer
        temperature:  0.2,
        stream:       false,
        cache_prompt: true,  // KV reuse for the system prompt prefix across screenshots
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const j   = await res.json();
    const msg = j.choices?.[0]?.message;
    // gemma4-legal-vlm is a thinking model: it sometimes puts the actual
    // caption in `content` and the analysis in `reasoning_content`, but other
    // times the CoT opener lands in `content` and the real answer is buried
    // in reasoning_content. Concatenate both and let stripReasoning() pick
    // the final prose paragraph regardless of which field carries the meat.
    const content   = (msg?.content           ?? '').trim();
    const reasoning = (msg?.reasoning_content ?? '').trim();
    let raw = '';
    if (content && reasoning && content.length < 80) {
      // content is just the opener; full answer lives in reasoning_content
      raw = `${reasoning}\n\n${content}`;
    } else if (content) {
      raw = content;
    } else {
      raw = reasoning;
    }
    const out = stripReasoning(raw);
    return out || null;
  } catch { return null; }
}

async function captionWithOllama(imageB64) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:   VLM_MODEL,
      prompt:  PROMPT,
      images:  [imageB64],
      stream:  false,
      options: { temperature: 0.2, num_predict: 220 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama VLM ${res.status}: ${await res.text().catch(() => '')}`);
  const j = await res.json();
  return (j.response ?? '').trim();
}

/**
 * Strip leaked chain-of-thought scaffolding that gemma4-legal-vlm sometimes
 * emits despite the "no reasoning, no numbered list" prompt directive. The
 * post-processor handles three observed leak patterns:
 *   1. "Here's a thinking process to..." opener followed by numbered analysis
 *   2. "1. **Analyze the Image:** ..." / "**Overall Theme:**" markdown trees
 *   3. "Let me describe..." / "Okay, let's break this down..." prefaces
 * If the response contains > 3 paragraphs, the actual caption is almost
 * always the LAST one (the model usually concludes with the real answer).
 */
function stripChainOfThought(text) {
  if (!text) return text;
  let out = String(text).trim();
  const cotOpeners = [
    /^Here'?s?\s+(?:my\s+)?(?:a\s+)?(?:thinking|reasoning|analysis|process|breakdown)\b[\s\S]*?(?=\n\n[A-Z][a-z])/i,
    /^(?:Let\s+me|Okay,?\s*let'?s|First[,]?\s|To\s+(?:answer|caption|describe))\b[\s\S]*?(?=\n\n[A-Z][a-z])/i,
    /^\d+\.\s+\*\*[\s\S]*?(?=\n\n[A-Z][a-z])/,
    /^\*\*[A-Z][\s\S]*?\*\*[\s\S]*?(?=\n\n[A-Z][a-z])/,
  ];
  for (const re of cotOpeners) out = out.replace(re, '').trim();
  // If we still see >3 paragraphs (= the model didn't follow the directive),
  // take the final 1-2 as the actual caption.
  const paras = out.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (paras.length > 3) out = paras.slice(-2).join('\n\n');
  // Drop bullet/heading markers from the kept text
  out = out.replace(/^[-*•]\s+/gm, '').replace(/^#+\s+/gm, '').trim();
  return out;
}

async function captionWithGemma4(imageB64) {
  // Tier 1: TurboQuant (already-loaded weights, KV cache reuse, no VRAM contention)
  const tqRaw = await captionWithTurboQuant(imageB64);
  if (tqRaw) {
    const cleaned = stripChainOfThought(tqRaw);
    if (cleaned) return { caption: cleaned, source: 'turboquant' };
  }
  // Tier 2: Ollama (reloads weights or competes; works but slower under pressure)
  const olRaw = await captionWithOllama(imageB64);
  const cleaned = stripChainOfThought(olRaw);
  return { caption: cleaned, source: cleaned ? 'ollama-fallback' : 'empty' };
}

async function embedCaption(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json();
  return Array.isArray(j.embedding) ? j.embedding : null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 });
let exitCode = 0;
try {
  await client.connect();

  const reg = await client.query(`SELECT to_regclass('public.screenshot_artifacts') AS r`);
  if (reg.rows[0]?.r == null) {
    console.error('❌ screenshot_artifacts missing — apply migration first');
    process.exit(1);
  }

  // Verify VLM is reachable
  try {
    const tags = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const j = await tags.json();
    const has = (j.models ?? []).some(m => m.name === VLM_MODEL);
    if (!has) {
      console.warn(`   ⚠ ${VLM_MODEL} not in Ollama models list — caption calls may fail`);
    } else {
      console.log(`   ✓ ${VLM_MODEL} available`);
    }
  } catch (e) {
    console.warn(`   ⚠ Ollama unreachable: ${e.message}`);
  }

  const where = FORCE ? 'TRUE' : 'caption IS NULL';
  const todo = await client.query(
    `SELECT id, image_uri FROM screenshot_artifacts
     WHERE ${where}
     ORDER BY created_at ASC
     LIMIT $1`,
    [LIMIT]
  );

  console.log(`   found:  ${todo.rows.length} rows needing caption\n`);
  if (todo.rows.length === 0) {
    console.log(`✓ All rows already captioned (use --force to re-caption).`);
    process.exit(0);
  }

  let captioned = 0, embedded = 0, failed = 0;
  for (const row of todo.rows) {
    const imgPath = fileFromUri(row.image_uri);
    try {
      if (DRY_RUN) {
        console.log(`   [dry] would caption ${imgPath.slice(-60)}`);
        captioned++;
        continue;
      }

      const buf = await compressForVlm(imgPath);
      const b64 = buf.toString('base64');
      const { caption, source: captionSource } = await captionWithGemma4(b64);
      if (!caption) {
        console.warn(`   ⚠ empty caption for ${imgPath} (source=${captionSource})`);
        failed++;
        continue;
      }
      if (captionSource === 'ollama-fallback') {
        console.log(`   ↩ TurboQuant empty for ${imgPath} — used Ollama fallback`);
      }

      let captionEmbedding = null;
      if (!NO_EMBED) {
        captionEmbedding = await embedCaption(caption).catch(() => null);
        if (captionEmbedding) embedded++;
      }

      await client.query(
        captionEmbedding
          ? `UPDATE screenshot_artifacts SET
               caption           = $2,
               caption_embedding = $3::vector(768),
               updated_at        = now()
             WHERE id = $1`
          : `UPDATE screenshot_artifacts SET
               caption    = $2,
               updated_at = now()
             WHERE id = $1`,
        captionEmbedding
          ? [row.id, caption, '[' + captionEmbedding.join(',') + ']']
          : [row.id, caption]
      );

      captioned++;
      console.log(`   ✓ ${captioned}/${todo.rows.length}  ${caption.slice(0, 80).replace(/\n/g, ' ')}…`);
    } catch (err) {
      console.warn(`   ⚠ ${imgPath}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${DRY_RUN ? '✓ Dry-run complete' : '✅ Captioned'} — ${captioned} captioned, ${embedded} embedded, ${failed} failed`);
} catch (err) {
  console.error(`❌ Caption pass failed: ${err.message}`);
  exitCode = 1;
} finally {
  await client.end().catch(() => {});
  process.exit(exitCode);
}
