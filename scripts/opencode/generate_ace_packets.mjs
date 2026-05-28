#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { promisify } from 'util';
import crypto from 'crypto';

const root = process.cwd();
const candidatesPaths = [
  path.resolve(root, 'summaries.merged.jsonl'),
  path.resolve(root, '.opencode/cards/summaries.merged.jsonl'),
  path.resolve(root, '.opencode/cards/summaries.jsonl'),
];
const qdrantPaths = [
  path.resolve(root, '.opencode/cards/qdrant-upload.ndjson'),
  path.resolve(root, 'qdrant-upload.ndjson'),
];

function findFirst(paths) {
  for (const p of paths) if (fs.existsSync(p)) return p;
  return null;
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function uuid() { return crypto.randomUUID(); }

async function streamJsonLines(filePath, onLine) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line || !line.trim()) continue;
    try { onLine(JSON.parse(line)); } catch (err) { console.error('parse error', err); }
  }
}

async function main() {
  const summariesPath = findFirst(candidatesPaths);
  const qdrantPath = findFirst(qdrantPaths);

  if (!summariesPath) {
    console.error('No summaries file found. Looked in:', candidatesPaths.join(', '));
    process.exit(1);
  }

  console.log('Using summaries:', summariesPath);
  if (qdrantPath) console.log('Using qdrant upload:', qdrantPath);

  const cards = [];
  await streamJsonLines(summariesPath, (obj) => {
    // Normalize common fields we expect
    const card = {
      id: obj.id || obj.card_id || obj.sourceRef || obj.source || crypto.randomUUID(),
      sourceRef: obj.sourceRef || obj.source || obj.file || obj.source_ref || null,
      summary: obj.summary || obj.summary_text || obj.text || obj.excerpt || '',
      score: typeof obj.score === 'number' ? obj.score : obj.score ? Number(obj.score) || 0 : 0,
      tags: obj.tags || obj.top_tags || obj.labels || [],
      clusterId: obj.clusterId || obj.cluster || obj.centroid || null,
      edges: obj.edges || obj.graph_edges || [],
      raw_length:
        obj.raw_length || (obj.text ? obj.text.length : obj.summary ? obj.summary.length : 0),
      original: obj,
    };
    cards.push(card);
  });

  // Optional: augment with qdrant metadata (id->payload) if available
  const qdrantMap = new Map();
  if (qdrantPath) {
    await streamJsonLines(qdrantPath, (obj) => {
      // qdrant upload points often have 'id' and 'payload'
      const id = obj.id || (obj.payload && (obj.payload.id || obj.payload.sourceRef));
      if (!id) return;
      qdrantMap.set(String(id), obj.payload || obj);
    });
  }

  // Sort by score desc
  cards.sort((a, b) => (b.score || 0) - (a.score || 0));
  // CLI tuning: --target-tokens, --min-tokens, --max-tokens, --grouping
  const ARGV = process.argv.slice(2);
  const argVal = (name, def = null) => {
    const i = ARGV.indexOf(name);
    if (i === -1) return def;
    const v = ARGV[i + 1];
    if (!v || v.startsWith('--')) return def;
    return v;
  };

  const hasFlag = (name) => ARGV.indexOf(name) !== -1;

  const TARGET = Number(argVal('--target-tokens', 4000));
  const TOKEN_MIN = Number(argVal('--min-tokens', 2000));
  const TOKEN_MAX = Number(argVal('--max-tokens', 8000));
  const GROUPING = argVal('--grouping', 'cluster-or-tag'); // 'cluster', 'tag', 'cluster-or-tag', 'none'

  // Group by clusterId or top tag to produce packets that are topically coherent
  const groups = new Map();
  for (const c of cards) {
    const primaryTag = Array.isArray(c.tags) && c.tags.length ? c.tags[0] : null;
    let key;
    if (GROUPING === 'cluster') key = c.clusterId || 'ungrouped';
    else if (GROUPING === 'tag') key = primaryTag || 'ungrouped';
    else if (GROUPING === 'none') key = 'ungrouped';
    else key = c.clusterId || primaryTag || 'ungrouped';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  // Prepare output dir
  const outDir = path.resolve(root, '.opencode/ace-packets');
  await promisify(fs.mkdir)(outDir, { recursive: true });

  // If requested, load quarantine list and build a set of ids/sourceRefs to exclude
  const excludeQuarantine = hasFlag('--exclude-quarantine') || hasFlag('--exclude-quarantine=true');
  const quarantineSet = new Set();
  if (excludeQuarantine) {
    const qPath = path.resolve(root, '.opencode/quarantine/invalid-cards.ndjson');
    if (fs.existsSync(qPath)) {
      await streamJsonLines(qPath, (obj) => {
        try {
          const cid = obj.card_id || (obj.payload && obj.payload.id) || obj.id || null;
          if (cid) quarantineSet.add(String(cid));
          if (obj.sourceRef) quarantineSet.add(String(obj.sourceRef));
          // also add payload.id if present
          if (obj.payload && obj.payload.id) quarantineSet.add(String(obj.payload.id));
        } catch (e) {
          /* ignore malformed lines */
        }
      });
      console.log('Loaded quarantine list, excluding', quarantineSet.size, 'ids');
    } else {
      console.log('Exclude-quarantine requested but no quarantine file at', qPath);
    }
  }

  const indexStreamPath = path.resolve(outDir, 'index.ndjson');
  const indexStream = fs.createWriteStream(indexStreamPath, { flags: 'w', encoding: 'utf8' });

  // Packetization char-per-token constant
  const CHAR_PER_TOKEN = 4;

  let packetCount = 0;

  for (const [groupKey, groupCards] of groups.entries()) {
    // sort group by score desc
    groupCards.sort((a, b) => (b.score || 0) - (a.score || 0));
    let cursor = 0;
    while (cursor < groupCards.length) {
      const packetId = uuid();
      const packetCards = [];
      const sourceRefs = new Set();
      const topTagsCounter = new Map();
      const edgesHints = [];
      let chars = 0;
      let rawChars = 0;

      for (let i = cursor; i < groupCards.length; i++) {
        const c = groupCards[i];
        // Skip quarantined cards when requested
        const idKeyCandidate = String(c.sourceRef || c.id || '');
        if (excludeQuarantine && quarantineSet.has(idKeyCandidate)) {
          cursor = i + 1;
          continue;
        }
        if (!c.sourceRef && !c.id) {
          cursor = i + 1;
          continue;
        }
        const idKey = String(c.sourceRef || c.id);
        if (sourceRefs.has(idKey)) {
          cursor = i + 1;
          continue;
        }
        const estChars = (c.summary || '').length || 0;
        const estTokens = estimateTokens(c.summary || '');

        // if adding this card would exceed TOKEN_MAX (chars), then break (but allow at least one card)
        if (chars + estChars > TOKEN_MAX * CHAR_PER_TOKEN && packetCards.length > 0) break;

        packetCards.push({
          card_id: c.id,
          sourceRef: c.sourceRef || c.id,
          summary: (c.summary || '').trim(),
          score: c.score || 0,
          tags: Array.isArray(c.tags) ? [...new Set(c.tags)] : [],
        });
        sourceRefs.add(idKey);

        if (Array.isArray(c.tags))
          for (const t of c.tags) topTagsCounter.set(t, (topTagsCounter.get(t) || 0) + 1);
        if (Array.isArray(c.edges))
          for (const e of c.edges) {
            if (e && (e.to || e.target || e.id))
              edgesHints.push({
                from: c.id,
                to: e.to || e.target || e.id,
                weight: e.weight || e.score || 1,
              });
            else if (typeof e === 'string') edgesHints.push({ from: c.id, to: e, weight: 1 });
          }

        chars += estChars;
        rawChars += c.raw_length || estChars;
        cursor = i + 1;

        // stop if we've met the TARGET (in tokens) and we have at least TOKEN_MIN
        const estTokensTotal = estimateTokens(packetCards.map((x) => x.summary).join('\n'));
        if (estTokensTotal >= TARGET && estTokensTotal >= TOKEN_MIN) break;
      }

      if (packetCards.length === 0) {
        // advance cursor to avoid infinite loop
        cursor++;
        continue;
      }

      const topTags = Array.from(topTagsCounter.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map((x) => x[0]);

      const packet = {
        query: '',
        packet_id: packetId,
        cards: packetCards,
        clusters: [groupKey],
        edges: edgesHints,
        top_tags: topTags,
        sourceRefs: Array.from(sourceRefs),
        compression_ratio: rawChars ? chars / rawChars : 1,
        estimated_tokens: estimateTokens(packetCards.map((c) => c.summary).join('\n')),
        created_at: new Date().toISOString(),
      };

      // validate packet has sourceRefs
      if (!packet.sourceRefs || packet.sourceRefs.length === 0) {
        // skip writing empty/invalid packet
        continue;
      }

      // write packet file
      const outPath = path.resolve(outDir, `packet-${packetId}.json`);
      fs.writeFileSync(outPath, JSON.stringify(packet, null, 2), 'utf8');

      // write index line
      const indexLine = {
        packet_id: packetId,
        path: `./${path.relative(root, outPath).replace(/\\/g, '/')}`,
        cards: packetCards.length,
        group: groupKey,
        tags: topTags,
      };
      indexStream.write(JSON.stringify(indexLine) + '\n');

      packetCount++;
    }
  }

  indexStream.end();
  console.log('Wrote', packetCount, 'packets to', outDir);
  console.log('Index at', indexStreamPath);
}

main().catch(err=>{ console.error(err); process.exit(2); });
