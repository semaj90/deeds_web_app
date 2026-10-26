// Scores lane quality from HUMAN labels (2 relevant / 1 partly / 0 not) against a pooled candidate JSONL.
// Usage: node scripts/atlas/score-golden-lanes-v1.mjs <candidates.jsonl> <labels.jsonl> [--min=1] [--out=path]
// Pooled-recall caveat: recall is measured against the pool only (relevant chunks nobody retrieved are invisible), so it is a RELATIVE lane comparison, not absolute recall.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function scoreGoldenLanes(candidates, labels, { min = 1 } = {}) {
  const lab = new Map(labels.map((l) => [`${l.queryId}|${l.chunkId}`, Number(l.label)]));
  const lanes = {};
  const q = { labelled: 0, withRelevant: 0, skipped: [] };
  for (const item of candidates) {
    const rows = item.candidates.map((c) => ({ ...c, label: lab.get(`${item.queryId}|${c.chunkId}`) }));
    const unlabelled = rows.filter((r) => r.label === undefined);
    if (unlabelled.length) { q.skipped.push({ queryId: item.queryId, unlabelled: unlabelled.length }); continue; }
    q.labelled += 1;
    const relevant = rows.filter((r) => r.label >= min);
    if (relevant.length) q.withRelevant += 1;
    for (const r of rows) {
      const key = r.lanes.length > 1 ? 'both' : r.lanes[0];
      for (const lane of new Set([...r.lanes, key])) {
        const s = (lanes[lane] ??= { candidates: 0, relevant: 0, queriesWithHit: new Set(), recallNum: 0, recallDen: 0 });
        s.candidates += 1;
        if (r.label >= min) { s.relevant += 1; s.queriesWithHit.add(item.queryId); }
      }
    }
    for (const lane of new Set(rows.flatMap((r) => r.lanes))) {
      const s = lanes[lane];
      s.recallDen += relevant.length;
      s.recallNum += relevant.filter((r) => r.lanes.includes(lane)).length;
    }
  }
  const out = {};
  for (const [lane, s] of Object.entries(lanes)) {
    out[lane] = { candidates: s.candidates, relevant: s.relevant, precision: s.candidates ? +(s.relevant / s.candidates).toFixed(4) : null,
      pooledRecall: lane === 'both' ? null : (s.recallDen ? +(s.recallNum / s.recallDen).toFixed(4) : null), queriesWithAHit: s.queriesWithHit.size };
  }
  return { schema: 'atlas.golden-lane-score.v1', minLabel: min, queries: q, lanes: out,
    caveats: ['pooled recall = share of pooled relevant chunks a lane found; unretrieved relevant chunks are invisible', 'small query set: wide uncertainty, do not rank lanes on <30 labelled queries',
      'queries with unlabelled candidates are skipped, not scored', 'pooling favours the embedding that built the pool'] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cPath, lPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const flag = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `=${d}`).split('=')[1];
  if (!cPath || !lPath) { console.error('usage: score-golden-lanes-v1.mjs <candidates.jsonl> <labels.jsonl> [--min=1] [--out=path]'); process.exit(2); }
  const rd = (p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const res = scoreGoldenLanes(rd(cPath), rd(lPath), { min: Number(flag('min', 1)) });
  res.checksum = 'sha256:' + createHash('sha256').update(JSON.stringify(res)).digest('hex');
  const out = flag('out', '');
  if (out) writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1));
}
