import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const inPath = path.join(repoRoot, '.opencode', 'cards', 'summaries.merged.jsonl');
const outDir = path.join(repoRoot, '.opencode', 'quarantine');
const outPath = path.join(outDir, 'invalid-cards.ndjson');

if (!fs.existsSync(inPath)) {
  console.error('Input not found:', inPath);
  process.exit(1);
}

const raw = fs.readFileSync(inPath, 'utf8');
const lines = raw.split(/\r?\n/).filter(Boolean);
const out = [];

for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  try {
    const o = JSON.parse(l);
    const cardIdRaw = o.card_id ?? o.id ?? null;
    const cardId = typeof cardIdRaw === 'string' && cardIdRaw.trim() ? cardIdRaw : `unknown:${i}`;
    const sourceRef = o.sourceRef ?? o.source_ref ?? null;

    // Minimal payload: keep id and empty summary, avoid embedding large raw text
    const payload = {
      id: o.id ?? null,
      summary: o.summary ?? '',
      raw: {}
    };

    out.push(JSON.stringify({
      card_id: cardId,
      sourceRef,
      reason: 'empty_summary_no_content',
      payload
    }));
  } catch (e) {
    // skip malformed lines
  }
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, out.join('\n') + (out.length ? '\n' : ''), 'utf8');
console.log('WROTE', out.length, outPath);
