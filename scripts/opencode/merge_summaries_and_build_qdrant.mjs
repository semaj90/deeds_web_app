import fs from 'fs/promises';
import { createReadStream } from 'fs';
import readline from 'readline';
import { join } from 'path';
import { spawnSync } from 'child_process';

// parse simple args
const ARGV = process.argv.slice(2);
const SKIP_PACKETS = ARGV.includes('--no-packets');

const SUMMARIES = '.opencode/cards/summaries.jsonl';
const MERGED = '.opencode/cards/summaries.merged.jsonl';
const EXISTING_QDRANT = '.opencode/qdrant-upload.ndjson';
const OUT_QDRANT = '.opencode/cards/qdrant-upload.ndjson';

async function readNdjsonMap(path, keyField = 'card_id') {
  const map = new Map();
  try {
    const rl = readline.createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const key = obj[keyField] || obj.id;
        if (key) map.set(key, obj);
      } catch (e) {}
    }
  } catch (e) {}
  return map;
}

async function main() {
  // read summaries
  const summariesRaw = [];
  try {
    const rl = readline.createInterface({
      input: createReadStream(SUMMARIES),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        summariesRaw.push(JSON.parse(line));
      } catch (e) {}
    }
  } catch (e) {
    console.error('No summaries file found at', SUMMARIES);
    return process.exit(1);
  }

  const originalCount = summariesRaw.length;
  let dryRunCount = 0;
  // dedupe by card_id+sourceRef: keep first occurrence
  const seen = new Set();
  const byCard = new Map();
  for (const s of summariesRaw) {
    const card = s.card_id || s.id;
    const src = s.sourceRef || s.file || null;
    const key = `${card}::${src}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // detect dry-run
    const tags = Array.isArray(s.keywords) ? s.keywords.concat(s.tags || []) : s.tags || [];
    const isDry =
      (tags && tags.includes('source:dry-run')) ||
      (typeof s.summary === 'string' && s.summary.startsWith('DRY_RUN'));
    if (isDry) dryRunCount++;
    if (!byCard.has(card)) byCard.set(card, []);
    byCard.get(card).push({ ...s, _isDry: isDry });
  }

  // load existing qdrant vectors to reuse
  const existingMap = await readNdjsonMap(EXISTING_QDRANT, 'id');

  const crypto = await import('crypto');
  const merged = [];
  const quarantined = [];
  for (const [card, entries] of byCard.entries()) {
    // prefer non-dry entries with atlas/sourceRef, then any non-dry, otherwise dry
    let pick = null;
    // find non-dry with tag source:atlas
    pick = entries.find((e) => (e.tags || e.keywords || []).includes('source:atlas') && !e._isDry);
    if (!pick) pick = entries.find((e) => !e._isDry);
    if (!pick) pick = entries[0];
    // Enforce acceptance rules: must have card_id, sourceRef (or file), and non-empty summary/text
    const cardId = card;
    const sourceRef = pick.sourceRef || pick.file || null;
    const summaryText = (pick.summary || pick.text || pick.summary_text || '').trim();
    const sourcePath = pick.file || pick.source_path || null;

    if (!cardId || !sourceRef || !summaryText) {
      // send to quarantine
      quarantined.push({
        card_id: cardId || null,
        sourceRef: sourceRef || null,
        reason: !cardId ? 'missing_card_id' : !sourceRef ? 'missing_sourceRef' : 'empty_summary',
        status: 'quarantined',
        payload: pick,
      });
      continue;
    }

    // compute a simple content_hash for acceptance (sha256 of cardId+sourceRef+summary)
    const h = crypto.createHash('sha256');
    h.update(String(cardId));
    h.update('\n');
    h.update(String(sourceRef));
    h.update('\n');
    h.update(String(summaryText));
    const content_hash = h.digest('hex');

    merged.push({
      card_id: cardId,
      sourceRef: sourceRef,
      source_path: sourcePath,
      summary: summaryText,
      content_hash,
      keywords: pick.keywords || [],
      tags: pick.tags || [],
      file: pick.file || null,
    });
  }

  // write merged summaries
  await fs.mkdir('.opencode/cards', { recursive: true });
  const mergedLines = merged.map((m) => JSON.stringify(m)).join('\n') + (merged.length ? '\n' : '');
  await fs.writeFile(MERGED, mergedLines, 'utf8');

  // write quarantined list for entries that failed acceptance rules
  if (quarantined.length) {
    await fs.mkdir('.opencode/quarantine', { recursive: true });
    const qPath = '.opencode/quarantine/invalid-cards.ndjson';
    const qLines =
      quarantined.map((q) => JSON.stringify(q)).join('\n') + (quarantined.length ? '\n' : '');
    await fs.writeFile(qPath, qLines, 'utf8');
    console.log('Wrote', quarantined.length, 'quarantined entries to', qPath);
  }

  // build qdrant ndjson: reuse vectors where possible, else empty array
  const qdrantLines = [];
  for (const m of merged) {
    const existing =
      existingMap.get(m.card_id) || existingMap.get(m.card_id.replace(/^file:/, '')) || null;
    const vector = existing && Array.isArray(existing.vector) ? existing.vector : [];
    const point = {
      id: m.card_id,
      vector,
      payload: {
        card_id: m.card_id,
        sourceRef: m.sourceRef,
        summary: m.summary,
        keywords: m.keywords,
        tags: m.tags,
        file: m.file,
      },
    };
    qdrantLines.push(JSON.stringify(point));
  }
  await fs.writeFile(OUT_QDRANT, qdrantLines.join('\n') + (qdrantLines.length ? '\n' : ''), 'utf8');

  // print 5 samples
  console.log('\nSample merged records (5):');
  for (let i = 0; i < Math.min(5, merged.length); i++) {
    console.log(JSON.stringify(merged[i], null, 2));
  }

  // counts
  const mergedCount = merged.length;
  let qdrantCount = qdrantLines.length;
  console.log('\nCounts:');
  console.log(' original summaries:', originalCount);
  console.log(' dry-run summaries: ', dryRunCount);
  console.log(' merged summaries:  ', mergedCount);
  console.log(' qdrant points:     ', qdrantCount);

  // optionally run generate_ace_packets as a post-merge step
  if (!SKIP_PACKETS) {
    try {
      console.log('\nRunning generate_ace_packets to build ACE packets...');
      const script = 'node';
      const scriptArgs = ['scripts/opencode/generate_ace_packets.mjs'];
      const res = spawnSync(script, scriptArgs, {
        stdio: 'inherit',
        cwd: process.cwd(),
        shell: false,
      });
      if (res.error) console.error('Failed to run generate_ace_packets:', res.error);
      else if (res.status !== 0) console.error('generate_ace_packets exited with code', res.status);
      else console.log('generate_ace_packets completed successfully');
    } catch (e) {
      console.error('Error running generate_ace_packets:', e);
    }
  }

  // exit
  process.exit(0);
}

main();
