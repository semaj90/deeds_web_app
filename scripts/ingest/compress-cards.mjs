#!/usr/bin/env node
/**
 * compress-cards.mjs
 *
 * Reads the ranked list from .tmp/retrieval-ranking-report.json, loads each
 * card's full text, applies compression rules, and emits a token-budget-capped
 * ACE packet.
 *
 * Compression rules (Phase 11D):
 *   - keep title / sourceRef / summary (first 2 sentences)
 *   - keep commands / test snippets (```bash blocks)
 *   - keep errors only as short fingerprints (first line only)
 *   - drop raw log lines (lines starting with timestamp patterns)
 *   - drop duplicate cards (same source deduplicated, highest score wins)
 *   - group by feature/file area (source prefix)
 *   - cap total tokens (approx 4 chars per token)
 *
 * Outputs:
 *   .opencode/ace-packet.json        — compact ranked packet for ACE context
 *   .opencode/ace-packet-summary.md  — human-readable summary
 *
 * Usage:
 *   node scripts/ingest/compress-cards.mjs --budget 6000
 *   node scripts/ingest/compress-cards.mjs --budget 8000 --dry-run
 */

import fs from 'fs/promises';
import path from 'path';

const ROOT        = process.cwd();
const CARDS_DIR   = path.join(ROOT, '.opencode', 'cards');
const TMP_DIR     = path.join(ROOT, '.tmp');
const OUT_DIR     = path.join(ROOT, '.opencode');
const REPORT_IN   = path.join(TMP_DIR, 'retrieval-ranking-report.json');
const OUT_PACKET  = path.join(OUT_DIR, 'ace-packet.json');
const OUT_SUMMARY = path.join(OUT_DIR, 'ace-packet-summary.md');

const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const budgetIdx   = args.indexOf('--budget');
const targetIdx   = args.indexOf('--target-tokens');
// --target-tokens takes precedence over --budget
const TOKEN_BUDGET = targetIdx >= 0
  ? parseInt(args[targetIdx + 1], 10)
  : (budgetIdx >= 0 ? parseInt(args[budgetIdx + 1], 10) : 6000);
const CHAR_BUDGET  = TOKEN_BUDGET * 4; // ~4 chars per token

// ── Compression helpers ────────────────────────────────────────────────────────

/** Extract ```bash / ```sh code blocks from text. */
function extractCommands(text) {
  const blocks = [];
  const re = /```(?:bash|sh|powershell|ps1)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) blocks.push(m[1].trim());
  return blocks;
}

/** Extract error fingerprints: lines matching common error patterns, first line only. */
function extractErrorFingerprints(text) {
  const prints = [];
  for (const line of text.split('\n')) {
    if (/error:|❌|✗|failed:|exception:|TypeError|RangeError/i.test(line)) {
      prints.push(line.trim().slice(0, 120));
      if (prints.length >= 3) break;
    }
  }
  return prints;
}

/** Drop raw log lines (timestamped, verbose output). */
function dropLogLines(text) {
  return text.split('\n')
    .filter(l => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(l))  // ISO timestamps
    .filter(l => !/^\[\d{2}:\d{2}:\d{2}[\].]/.test(l))        // [HH:MM:SS] prefix
    .filter(l => !/^> \S+ \d+ (GET|POST|PUT|DELETE|PATCH)/.test(l)) // HTTP logs
    .join('\n');
}

/** Safe number formatter: formats a value to a specified number of decimal digits. */
function fmt(v, digits = 4) {
  return Number.isFinite(Number(v)) ? Number(Number(v)).toFixed(digits) : '0.0000';
}

/** Extract summary: first 2 meaningful sentences after any heading. */
function extractSummary(text, maxChars = 300) {
  const stripped = text.replace(/^#+\s+.*/gm, '').replace(/```[\s\S]*?```/g, '').trim();
  const sentences = stripped.match(/[^.!?\n]{10,}[.!?]/g) || [];
  return sentences.slice(0, 2).join(' ').slice(0, maxChars);
}

/** Compress a single card to a compact representation. */
function compressCard(card) {
  const text = dropLogLines(card.text || '');
  const commands = extractCommands(text);
  const errors   = extractErrorFingerprints(text);
  const summary  = extractSummary(text);

  let out = `### ${card.title?.slice(0, 120).replace(/\n/g, ' ')}\n`;
  out += `**source**: \`${card.source || ''}\`\n`;
  if (summary)  out += `${summary}\n`;
  if (errors.length)   out += `**errors**: ${errors.join(' | ')}\n`;
  if (commands.length) out += `**cmds**:\n\`\`\`\n${commands.slice(0,2).join('\n---\n').slice(0,400)}\n\`\`\`\n`;

  return out.trim();
}

// ── Deduplication by source prefix ────────────────────────────────────────────
function deduplicateBySource(ranked) {
  const seen = new Map(); // dedupeKey → best entry
  for (const entry of ranked) {
    // prefer explicit sourceRef when available, then source, id, file, title
    const rawKey = entry.sourceRef || entry.source || entry.id || entry.file || entry.title || '';
    const key = String(rawKey).replace(/\\/g, '/');
    const score = Number.isFinite(Number(entry.score)) ? Number(entry.score) : 0;
    if (!seen.has(key) || Number(seen.get(key).score || 0) < score) {
      seen.set(key, Object.assign({}, entry, { score }));
    }
  }
  return [...seen.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}

// ── Group by feature area (source prefix) ─────────────────────────────────────
function groupByArea(cards) {
  const groups = new Map();
  for (const c of cards) {
    const src = (c.source || '').replace(/\\/g, '/');
    const area = src.split('/').slice(0, 2).join('/') || 'misc';
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(c);
  }
  return groups;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n── Compress Cards ────────────────────────────────────────`);
  console.log(`  budget : ${TOKEN_BUDGET} tokens (~${CHAR_BUDGET} chars)${DRY_RUN ? '  [dry-run]' : ''}`);

  // Load ranked report
  let report;
  try {
    report = JSON.parse(await fs.readFile(REPORT_IN, 'utf8'));
  } catch {
    console.error(`❌ ${REPORT_IN} not found — run rank-cards.mjs first`);
    process.exit(1);
  }

  const { query, ranked: rankedEntries } = report;
  console.log(`  ranked entries: ${rankedEntries.length}`);

  // Load quarantine list (skip any quarantined card IDs)
  const QUARANTINE_PATH = path.join(OUT_DIR, 'quarantine', 'invalid-cards.ndjson');
  const quarantined = new Set();
  try {
    const qtext = await fs.readFile(QUARANTINE_PATH, 'utf8').catch(() => '');
    for (const line of qtext.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.card_id) quarantined.add(String(obj.card_id));
        else if (obj.id) quarantined.add(String(obj.id));
      } catch (e) { /* ignore malformed lines */ }
    }
  } catch (e) {
    // ignore if quarantine not present
  }
  console.log(`  quarantine: ${quarantined.size} entries`);

  // Deduplicate
  const deduped = deduplicateBySource(rankedEntries);
  // ensure sorted by score desc before selecting top candidates
  deduped.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  console.log(`  after dedup   : ${deduped.length}`);

  // Load full card texts for top candidates (load 2× budget to allow trimming)
  const candidates = deduped.slice(0, Math.min(deduped.length, TOP_LOAD));
  const cardMap = new Map();
  const files = await fs.readdir(CARDS_DIR).catch(() => []);
  let genIdCounter = 1;
  for (const f of files) {
    if (!/\.json$/.test(f)) continue;
    try {
      const c = JSON.parse(await fs.readFile(path.join(CARDS_DIR, f), 'utf8'));
      // ensure every card has a stable id
      if (!c.id) {
        c.id = `gen:${String(genIdCounter++)}`;
      }
      cardMap.set(c.id, c);
    } catch { /* skip */ }
  }

  // Compress and pack within budget
  const packedCards = [];
  let totalChars = 0;
  let dropped = 0;
  const seenIds = new Set();
  const packetSourceRefs = {};

  for (const entry of candidates) {
    const card = cardMap.get(entry.id);
    if (!card) { dropped++; continue; }

    // computed stable output id
    const outId = entry.id || card.id;
    // skip quarantined or explicitly invalid cards
    if (quarantined.has(String(outId)) || quarantined.has(String(entry.id)) || quarantined.has(String(card.id)) || quarantined.has(String(card.sourceRef || '')) ) {
      dropped++;
      continue;
    }

    // sanitize numeric fields on card + entry to avoid null/undefined
    card.semanticScore = Number.isFinite(Number(card.semanticScore)) ? Number(card.semanticScore) : 0;
    card.recencyScore = Number.isFinite(Number(card.recencyScore)) ? Number(card.recencyScore) : 0;
    card.sourceRefConfidence = Number.isFinite(Number(card.sourceRefConfidence)) ? Number(card.sourceRefConfidence) : 0;
    card.boosts = card.boosts ?? 0;

    const entryScore = Number.isFinite(Number(entry.score)) ? Number(entry.score) : 0;

    const compressed = compressCard(card);
    const chars = compressed.length;

    if (totalChars + chars > CHAR_BUDGET) {
      dropped++;
      continue;
    }

    // avoid duplicate ids in packet
    if (seenIds.has(outId)) {
      // skip duplicate id
      dropped++;
      continue;
    }
    seenIds.add(outId);

    const sourceRef = entry.sourceRef ?? card.sourceRef ?? entry.source ?? card.source ?? null;
    packedCards.push({
      id:        outId,
      title:     card.title?.slice(0, 120).replace(/\n/g, ' '),
      sourceRef,
      score:     entryScore,
      signals:   entry.signals ?? null,
      summary:   entry.summary ?? extractSummary(card.text || ''),
      selected:  true,
      compressed,
      charCount: chars,
    });
    packetSourceRefs[outId] = sourceRef;
    totalChars += chars;
  }

  const tokenEstimate = Math.round(totalChars / 4);
  console.log(`  packed: ${packedCards.length} cards | ${totalChars} chars (~${tokenEstimate} tokens) | dropped: ${dropped}`);

  // Group summary
  const groups = groupByArea(packedCards);
  console.log(`  areas : ${[...groups.keys()].slice(0, 6).join(', ')}${groups.size > 6 ? ` +${groups.size-6} more` : ''}`);

  // Build packet
  const packet = {
    generatedAt:   new Date().toISOString(),
    query,
    tokenBudget:   TOKEN_BUDGET,
    tokenEstimate,
    totalCards:    packedCards.length,
    droppedCards:  dropped,
    sourceRefs:    packetSourceRefs,
    cards: packedCards,
  };

  // Build summary markdown
    const summaryLines = [
    `# ACE Packet Summary`,
    ``,
    `Generated: ${packet.generatedAt}`,
    `Query: "${query}"`,
    `Cards: ${packedCards.length} / budget: ${TOKEN_BUDGET} tokens (~${tokenEstimate} used)`,
    ``,
    `## Areas`,
    ...[...groups.entries()].map(([area, cards]) =>
      `- **${area}** — ${cards.length} card${cards.length !== 1 ? 's' : ''} (top score: ${fmt(cards[0]?.score)})`
    ),
    ``,
    `## Top 10 Cards`,
    ...packedCards.slice(0, 10).map((c, i) =>
      `${i+1}. \`${c.source}\` — score ${fmt(c.score)}`
    ),
    ``,
    `## Next Gate`,
    `Wire real embeddings: replace \`pseudoEmbed()\` in embed-cards.mjs + rank-cards.mjs`,
    `with \`POST http://localhost:11434/api/embed\` (Ollama embeddinggemma:latest).`,
    `Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.`,
  ];
  const summaryMd = summaryLines.join('\n');

  if (!DRY_RUN) {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(OUT_PACKET,  JSON.stringify(packet, null, 2), 'utf8');
    await fs.writeFile(OUT_SUMMARY, summaryMd, 'utf8');
    console.log(`\n  ✅ wrote ${OUT_PACKET}`);
    console.log(`  ✅ wrote ${OUT_SUMMARY}`);
  } else {
    console.log(`\n  dry-run: would write ${packedCards.length} cards to ${OUT_PACKET}`);
  }

  console.log(`──────────────────────────────────────────────────────────\n`);
}

// Load 2× the likely useful set to allow budget trimming
const TOP_LOAD = 1000;

main().catch(e => { console.error(e); process.exit(1); });