#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export function feedbackCardIdsV1(event) {
  const payload = event?.payload;
  const raw = event?.card_id != null ? [event.card_id]
    : event?.card_ids ?? payload?.card_ids ?? (payload?.card_id != null ? [payload.card_id] : []);
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string' || !id.trim())) return [];
  return [...new Set(raw)];
}

export function excludedWeightObservationV1(event) {
  return [event, event?.payload].some((item) => item && (
    item.trainingEligible === false || item.retrieval_mode === 'phase19-seed' ||
    item.event_type === 'seed_proposal' || item.schema === 'atlas.retrieval-seed-proposal.v1'
  ));
}

async function readJsonl(filePath) {
  try {
    const info = await fs.stat(filePath);
    if (info.size > 16 * 1024 * 1024) throw new Error('WEIGHT_PREVIEW_INPUT_SIZE_LIMIT');
    const bytes = await fs.readFile(filePath);
    if (bytes.length > 16 * 1024 * 1024) throw new Error('WEIGHT_PREVIEW_INPUT_SIZE_LIMIT');
    const data = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const rows = data
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    return { path: filePath, exists: true, checksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, rows };
  } catch (e) {
    if (e.code === 'ENOENT') return { path: filePath, exists: false, checksum: null, rows: [] };
    throw e;
  }
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function combineCounts(arr) {
  const out = { thumbs_up:0, thumbs_down:0, copied:0, clicked:0, total:0, dependency_hits:0 };
  arr.forEach(a => {
    out.thumbs_up += safeNum(a.thumbs_up, 0);
    out.thumbs_down += safeNum(a.thumbs_down, 0);
    out.copied += safeNum(a.copied, 0);
    out.clicked += safeNum(a.clicked, 0);
    out.dependency_hits += safeNum(a.dependency_hit, 0);
    out.total += 1;
  });
  return out;
}

async function main() {
  if (!process.argv.includes('--dry-run') || process.argv.includes('--redis') || process.argv.includes('--apply')) {
    throw new Error('WEIGHT_UPDATE_APPLY_BLOCKED_USE_OFFLINE_DRY_RUN');
  }
  const repoRoot = path.resolve(process.cwd());
  const bifrostPath = path.join(repoRoot, '.tmp', 'bifrost-trace.jsonl');
  const retrievalPath = path.join(repoRoot, '.tmp', 'atlas-retrieval-loop.jsonl');
  const qdrantPath = path.join(repoRoot, '.tmp', 'qdrant-cards.jsonl');
  const atlasCardsPath = path.join(repoRoot, '.tmp', 'atlas-cards-for-weights.jsonl');
  const feedbackFile = path.join(repoRoot, '.tmp', 'feedback-events.jsonl');

  const inputs = await Promise.all([bifrostPath, retrievalPath, qdrantPath, atlasCardsPath, feedbackFile].map(readJsonl));
  const [bifrost, retrievals, qdrant, atlasCards, fileFeedback] = inputs.map((input) => input.rows);


  // index retrievals by card id
  const byCard = new Map();

  function ensureCard(id) {
    if (!byCard.has(id)) byCard.set(id, { id, cosines: [], authorities: [], intents: [], events: [] });
    return byCard.get(id);
  }

  retrievals.filter((row) => !excludedWeightObservationV1(row)).forEach(r => {
    const id = r.card_id || r.id || r.card || r.payload?.card_id;
    if (!id) return;
    const c = ensureCard(id);
    if (r.cosine || r.score) c.cosines.push(safeNum(r.cosine ?? r.score, 0));
    if (r.authority) c.authorities.push(safeNum(r.authority, 0.5));
    if (r.intent) c.intents.push(r.intent);
  });

  bifrost.filter((row) => !excludedWeightObservationV1(row)).forEach(b => {
    const id = b.card_id || b.target_id || b.id || b.payload?.card_id;
    if (!id) return;
    const c = ensureCard(id);
    if (b.cosine) c.cosines.push(safeNum(b.cosine, 0));
    if (b.authority) c.authorities.push(safeNum(b.authority, 0.5));
  });

  // qdrant payloads may include authority/metadata
  qdrant.filter((row) => !excludedWeightObservationV1(row)).forEach(q => {
    const id = q.id || q.payload?.id || q.payload?.card_id;
    if (!id) return;
    const c = ensureCard(id);
    if (q.authority) c.authorities.push(safeNum(q.authority, 0.5));
    if (q.metadata && q.metadata.feature_label) c.feature_label = q.metadata.feature_label;
  });

  // combine feedback events from files
  const allFeedback = fileFeedback;
  allFeedback.filter((row) => !excludedWeightObservationV1(row)).forEach(ev => {
    const ids = feedbackCardIdsV1(ev);
    ids.forEach(id => {
      const c = ensureCard(id);
      c.events.push(ev.payload ?? ev);
    });
  });

  const results = [];
  // Seed from atlas cards input so cards with no retrievals are still considered
  for (const c of atlasCards.filter((row) => !excludedWeightObservationV1(row))) {
    const id = c.card_id || c.card || c.id;
    if (!id) continue;
    const info = ensureCard(id);
    if (c.feature_label) info.feature_label = c.feature_label;
    if (c.sourceRef) info.sourceRef = c.sourceRef;
    if (c.summary) info.summary = c.summary;
  }
  for (const [id, info] of byCard) {
    const cosine = info.cosines.length ? info.cosines.reduce((a,b)=>a+b,0)/info.cosines.length : 0;
    const authority = info.authorities.length ? info.authorities.reduce((a,b)=>a+b,0)/info.authorities.length : 0.5;
    const intentMatch = (() => {
      if (!info.intents || !info.intents.length) return 0;
      // user_intent_match: fraction of intents equal to "user"
      const matches = info.intents.filter(x => x === 'user' || x === 'match' || x === 'intent_match').length;
      return matches / info.intents.length;
    })();

    const counts = combineCounts(info.events || []);
    const recent_success_weight = counts.total ? clamp01((counts.thumbs_up - counts.thumbs_down) / Math.max(1, counts.total)) : 0;
    const dependency_hotpath_weight = counts.total ? clamp01(counts.dependency_hits / Math.max(1, counts.total)) : 0;

    const final_score = clamp01(
      0.45 * clamp01(cosine)
      + 0.20 * clamp01(authority)
      + 0.15 * clamp01(intentMatch)
      + 0.10 * clamp01(recent_success_weight)
      + 0.10 * clamp01(dependency_hotpath_weight)
    );

    const record = {
      card_id: id,
      canonicalAuthority: false,
      trainingEligible: false,
      promotionEligible: false,
      scoreQualification: 'HEURISTIC_PREVIEW_NOT_TRAINED_OR_EVALUATED',
      sourceRef: info.sourceRef ?? null,
      feature_label: info.feature_label || null,
      components: {
        cosine: Number(cosine.toFixed(4)),
        authority: Number(authority.toFixed(4)),
        intentMatch: Number(intentMatch.toFixed(4)),
        recent_success_weight: Number(recent_success_weight.toFixed(4)),
        dependency_hotpath_weight: Number(dependency_hotpath_weight.toFixed(4))
      },
      final_score: Number(final_score.toFixed(4)),
      counts
    };

    results.push(record);
  }

  console.log(JSON.stringify({ schema: 'atlas.card-weight-preview.v1', status: 'PREVIEW_ONLY_APPLY_BLOCKED',
    writesPerformed: false, canonicalAuthority: false, trainingEligible: false, promotionEligible: false,
    artifactBaseDirectory: repoRoot,
    inputs: inputs.map(({ rows, ...input }) => ({ ...input, rowCount: rows.length })),
    unresolvedRetrievalCardIdentityCount: retrievals.filter((row) => !row?.card_id && !row?.id && !row?.card && !row?.payload?.card_id).length,
    excludedObservations: [...retrievals, ...bifrost, ...qdrant, ...allFeedback, ...atlasCards].filter(excludedWeightObservationV1).length,
    records: results,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node token-card-weight-updater.mjs --dry-run (apply and Redis publication blocked)');
  } else {
    main().catch(err => { console.error(err); process.exitCode = 2; });
  }
}
