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
      score: typeof obj.score === 'number' ? obj.score : (obj.score ? Number(obj.score) || 0 : 0),
      tags: obj.tags || obj.top_tags || obj.labels || [],
      clusterId: obj.clusterId || obj.cluster || obj.centroid || null,
      edges: obj.edges || obj.graph_edges || [],
      raw_length: obj.raw_length || (obj.text ? obj.text.length : (obj.summary ? obj.summary.length : 0)),
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
  cards.sort((a,b)=> (b.score||0) - (a.score||0));

  // Prepare output dir
  const outDir = path.resolve(root, '.opencode/ace-packets');
  await promisify(fs.mkdir)(outDir, { recursive: true });

  const indexStreamPath = path.resolve(outDir, 'index.ndjson');
  const indexStream = fs.createWriteStream(indexStreamPath, { flags: 'w', encoding: 'utf8' });

  // Packetization
  const MAX_TOKENS = 4000; // target 2k-8k, pick 4k
  const MAX_CHARS = MAX_TOKENS * 4;

  let packetCount = 0;
  let cursor = 0;

  while (cursor < cards.length) {
    const packetId = uuid();
    const packetCards = [];
    const sourceRefs = new Set();
    const topTagsCounter = new Map();
    const edgesHints = [];
    let chars = 0;
    let rawChars = 0;

    for (let i = cursor; i < cards.length; i++) {
      const c = cards[i];
      if (!c.sourceRef && !c.id) continue;
      if (sourceRefs.has(c.sourceRef || c.id)) continue; // dedupe by sourceRef
      const est = (c.summary || '').length;
      if (chars + est > MAX_CHARS && packetCards.length > 0) break;

      packetCards.push({
        sourceRef: c.sourceRef || c.id,
        summary: (c.summary || '').trim(),
        score: c.score || 0,
        tags: Array.isArray(c.tags) ? [...new Set(c.tags)] : [],
      });
      sourceRefs.add(c.sourceRef || c.id);

      // tags tally
      if (Array.isArray(c.tags)) for (const t of c.tags) topTagsCounter.set(t, (topTagsCounter.get(t)||0)+1);

      // edges
      if (Array.isArray(c.edges)) for (const e of c.edges) {
        // compress edge to minimal hint
        if (e && (e.to || e.target || e.id)) {
          edgesHints.push({ from: c.id, to: e.to || e.target || e.id, weight: e.weight || e.score || 1 });
        } else if (typeof e === 'string') edgesHints.push({ from: c.id, to: e, weight: 1 });
      }

      chars += est;
      rawChars += c.raw_length || est;
      cursor = i + 1;
    }

    // compute top tags
    const topTags = Array.from(topTagsCounter.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10).map(x=>x[0]);

    const packet = {
      query: '',
      packet_id: packetId,
      cards: packetCards,
      clusters: [],
      edges: edgesHints,
      top_tags: topTags,
      sourceRefs: Array.from(sourceRefs),
      compression_ratio: rawChars ? (chars / rawChars) : 1,
      estimated_tokens: estimateTokens(packetCards.map(c=>c.summary).join('\n')),
      created_at: new Date().toISOString(),
    };

    // write packet file
    const outPath = path.resolve(outDir, `packet-${packetId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(packet, null, 2), 'utf8');

    // write index line
    const indexLine = { packet_id: packetId, path: `./${path.relative(root, outPath).replace(/\\/g, '/')}`, cards: packetCards.length, tags: topTags };
    indexStream.write(JSON.stringify(indexLine) + '\n');

    packetCount++;
  }

  indexStream.end();
  console.log('Wrote', packetCount, 'packets to', outDir);
  console.log('Index at', indexStreamPath);
}

main().catch(err=>{ console.error(err); process.exit(2); });
