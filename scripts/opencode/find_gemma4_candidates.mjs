import fs from 'fs';
import readline from 'readline';
import path from 'path';

const IN = path.resolve('.opencode/qdrant-upload.ndjson');
const OUT = path.resolve('.opencode/gemma4_candidates.ndjson');

if (!fs.existsSync(IN)) {
  console.error('Input NDJSON not found:', IN);
  process.exit(2);
}

const rl = readline.createInterface({ input: fs.createReadStream(IN), crlfDelay: Infinity });
const summaryCounts = new Map();
const candidates = [];

function isGenericSummary(s) {
  if (!s) return true;
  const t = s.trim().toLowerCase();
  if (t === '' || t === 'todo' || t === 'tbd' || t === 'n/a' || t === 'none') return true;
  if (t.length < 20) return true; // very short
  return false;
}

(async () => {
  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      continue;
    }
    const payload = obj.payload || {};
    const card = payload.card_id || obj.id || null;
    const summary = (payload.summary || '').trim();
    const keywords = Array.isArray(payload.keywords) ? payload.keywords : [];
    const tags = Array.isArray(payload.tags) ? payload.tags : [];

    // count summary occurrences for duplicate detection
    const key = summary || '__EMPTY__';
    summaryCounts.set(key, (summaryCounts.get(key) || 0) + 1);

    // basic heuristics
    const reasons = [];
    if (!summary || summary.length < 40) reasons.push('empty_or_short_summary');
    if (!keywords || keywords.length <= 1) reasons.push('missing_or_sparse_keywords');
    if (!tags || tags.length === 0) reasons.push('missing_tags');
    if (isGenericSummary(summary)) {
      if (!reasons.includes('empty_or_short_summary')) reasons.push('generic_summary');
    }

    if (reasons.length) {
      candidates.push({ card_id: card, reasons, summary, keywords, tags });
    }
  }

  // mark duplicates
  const dupKeys = new Set();
  for (const [s, cnt] of summaryCounts.entries()) {
    if (s !== '__EMPTY__' && cnt > 3) dupKeys.add(s);
  }

  const outStream = fs.createWriteStream(OUT, { flags: 'w' });
  let written = 0;
  for (const c of candidates) {
    if (dupKeys.has(c.summary)) c.reasons.push('duplicated_summary');
    outStream.write(JSON.stringify(c) + '\n');
    written++;
  }
  outStream.end();
  console.log('Wrote candidates:', written, 'to', OUT);
})();
