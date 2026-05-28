#!/usr/bin/env node
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';

async function readJsonl(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return data
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

async function maybeReadRedisStream(url = 'redis://127.0.0.1:6379', streamKey = 'feedback:events', count = 1000) {
  try {
    const ioredis = await import('ioredis');
    const client = new ioredis.default(url);
    // XRANGE stream - get last N entries
    const entries = await client.xrange(streamKey, '-', '+', 'COUNT', count);
    await client.quit();
    // entries: [[id, [field1, val1, field2, val2]], ...]
    return entries.map(([id, kv]) => {
      const obj = { id };
      for (let i = 0; i < kv.length; i += 2) obj[kv[i]] = kv[i+1];
      // try parse json fields
      if (obj.payload) {
        try { obj.payload = JSON.parse(obj.payload); } catch(e){}
      }
      return obj;
    });
  } catch (e) {
    return [];
  }
}

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
  const repoRoot = path.resolve(process.cwd());
  const bifrostPath = path.join(repoRoot, '.tmp', 'bifrost-trace.jsonl');
  const retrievalPath = path.join(repoRoot, '.tmp', 'atlas-retrieval-loop.jsonl');
  const qdrantPath = path.join(repoRoot, '.tmp', 'qdrant-cards.jsonl');
  const atlasCardsPath = path.join(repoRoot, '.tmp', 'atlas-cards-for-weights.jsonl');
  const feedbackFile = path.join(repoRoot, '.tmp', 'feedback-events.jsonl');

  console.log('Reading inputs...');
  const bifrost = await readJsonl(bifrostPath);
  const retrievals = await readJsonl(retrievalPath);
  const qdrant = await readJsonl(qdrantPath);
  const atlasCards = await readJsonl(atlasCardsPath);
  const fileFeedback = await readJsonl(feedbackFile);

  const redisUrl = process.env.REDIS_URL || process.env.REDIS || 'redis://127.0.0.1:6379';
  const redisStreamKey = process.env.FEEDBACK_STREAM || 'feedback:events';
  const redisEnabled = process.argv.includes('--redis');

  let redisFeedback = [];
  if (redisEnabled) {
    console.log('Reading Redis stream', redisStreamKey);
    redisFeedback = await maybeReadRedisStream(redisUrl, redisStreamKey, 2000);
  }

  // index retrievals by card id
  const byCard = new Map();

  function ensureCard(id) {
    if (!byCard.has(id)) byCard.set(id, { id, cosines: [], authorities: [], intents: [], events: [] });
    return byCard.get(id);
  }

  retrievals.forEach(r => {
    const id = r.card_id || r.id || r.card || r.payload?.card_id;
    if (!id) return;
    const c = ensureCard(id);
    if (r.cosine || r.score) c.cosines.push(safeNum(r.cosine ?? r.score, 0));
    if (r.authority) c.authorities.push(safeNum(r.authority, 0.5));
    if (r.intent) c.intents.push(r.intent);
  });

  bifrost.forEach(b => {
    const id = b.card_id || b.target_id || b.id || b.payload?.card_id;
    if (!id) return;
    const c = ensureCard(id);
    if (b.cosine) c.cosines.push(safeNum(b.cosine, 0));
    if (b.authority) c.authorities.push(safeNum(b.authority, 0.5));
  });

  // qdrant payloads may include authority/metadata
  qdrant.forEach(q => {
    const id = q.id || q.payload?.id || q.payload?.card_id;
    if (!id) return;
    const c = ensureCard(id);
    if (q.authority) c.authorities.push(safeNum(q.authority, 0.5));
    if (q.metadata && q.metadata.feature_label) c.feature_label = q.metadata.feature_label;
  });

  // combine feedback events from files
  const allFeedback = [...fileFeedback, ...redisFeedback];
  allFeedback.forEach(ev => {
    const ids = ev.card_id ? [ev.card_id] : ev.card_ids || ev.payload?.card_ids || ev.payload?.card_id ? [ev.payload.card_id] : [];
    ids.forEach(id => {
      const c = ensureCard(id);
      c.events.push(ev.payload ?? ev);
    });
  });

  // prepare outputs
  const outPath = path.join(repoRoot, '.tmp', 'token-card-weights.jsonl');
  const summaryPath = path.join(repoRoot, 'reports', 'token-card-weight-summary.md');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });

  const outStream = createWriteStream(outPath, { flags: 'w' });

  const results = [];
  // Seed from atlas cards input so cards with no retrievals are still considered
  for (const c of atlasCards) {
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

    outStream.write(JSON.stringify(record) + '\n');
    results.push(record);
  }

  outStream.end();

  // write markdown summary
  results.sort((a,b)=>b.final_score - a.final_score);
  const top = results.slice(0, 20);
  const mdLines = [
    '# Token / Card Weight Summary',
    `Generated: ${new Date().toISOString()}`,
    `Processed cards: ${results.length}`,
    '',
    '## Top cards by final_score',
    '',
    '| rank | card_id | score | feature | clicks | copies | thumbs_up | thumbs_down |',
    '|---:|---|---:|---|---:|---:|---:|---:|'
  ];
  top.forEach((r,i) => {
    mdLines.push(`| ${i+1} | ${r.card_id} | ${r.final_score} | ${r.feature_label || ''} | ${r.counts.clicked || 0} | ${r.counts.copied || 0} | ${r.counts.thumbs_up || 0} | ${r.counts.thumbs_down || 0} |`);
  });
  mdLines.push('', '## Notes', '', '- Scoring formula used:', '- final_score = 0.45*cosine + 0.20*authority + 0.15*user_intent_match + 0.10*recent_success_weight + 0.10*dependency_hotpath_weight');
  await fs.writeFile(summaryPath, mdLines.join('\n'), 'utf8');

  // optional publish to Redis
  if (redisEnabled) {
    try {
      // Safety checks before publishing
      if (!results || results.length === 0) {
        console.log('Skipping Redis publish: no results to publish (processed cards = 0)');
      } else if (!results.some(r => r.final_score && Number(r.final_score) > 0)) {
        console.log('Skipping Redis publish: all final_score values are zero');
      } else if (!results.every(r => (r.card_id && String(r.card_id).length) || (r.sourceRef && String(r.sourceRef).length))) {
        console.log('Skipping Redis publish: some rows missing card_id and sourceRef');
      } else {
        const ioredis = await import('ioredis');
        const client = new ioredis.default(redisUrl);
        for (const r of results) {
          const key = `atlas:weights:card:${r.card_id}`;
          await client.hset(key, { score: String(r.final_score), updated: new Date().toISOString(), payload: JSON.stringify(r) });
          if (r.feature_label) {
            const fkey = `atlas:weights:feature:${r.feature_label}`;
            await client.hincrbyfloat(fkey, 'aggregate_score', r.final_score);
          }
        }
        await client.quit();
        console.log('Published weights to Redis');
      }
    } catch (e) {
      console.warn('Redis publish failed:', e.message || e);
    }
  }

  console.log('Wrote', outPath, 'and', summaryPath);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node token-card-weight-updater.mjs [--redis]');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(2); });
