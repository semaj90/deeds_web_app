#!/usr/bin/env node
/**
 * Offline blind-review server for the pooled golden relevance queue (SEM768-GATE-00F1).
 *
 * Thin surface over the EXISTING atlas.golden-relevance-review-item.v1 queue; no new corpus format.
 * Reads   .tmp/atlas/golden-relevance-review-queue-pooled-v1.ndjson
 * Writes  .tmp/atlas/golden-relevance-judgments-v1.ndjson            (one line per graded candidate)
 *         .tmp/atlas/golden-relevance-review-queue-pooled-judged-v1.ndjson (queue with grades merged; feed to
 *                                                                    validate-golden-relevance-review-queue-v1.mjs)
 * Never touches Postgres, Valkey or Qdrant. Never shows run/rank/score/retrievedBy/proxy hints (those live in
 * the separate provenance sidecar). Binds 127.0.0.1 only.
 *
 * Usage: node scripts/atlas/serve-golden-review-v1.mjs [--pilot=10] [--port=8899] [--reviewer=<id>]
 * Evaluation unit is SOURCE_FILE: candidate identity is the canonical source_ref (packet_key is 1:1 with it).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, dflt) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? '').split('=')[1] ?? dflt;
const pilot = Number(arg('pilot', 0));
const port = Number(arg('port', 8899));
const defaultReviewer = arg('reviewer', '');
const queuePath = path.join(repoRoot, '.tmp/atlas/golden-relevance-review-queue-pooled-v1.ndjson');
const outDir = path.resolve(repoRoot, arg('out-dir', '.tmp/atlas'));
fs.mkdirSync(outDir, { recursive: true });
const judgmentsPath = path.join(outDir, 'golden-relevance-judgments-v1.ndjson');
const judgedQueuePath = path.join(outDir, 'golden-relevance-review-queue-pooled-judged-v1.ndjson');

if (!fs.existsSync(queuePath)) throw new Error(`Missing queue: ${queuePath} (run prepare_golden_review_pool_v1.py --pooled then --bind-adapt)`);
let queue = fs.readFileSync(queuePath, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
if (pilot > 0) queue = queue.slice(0, pilot);

// flat, stable review order: query by query
const items = [];
queue.forEach((q, qi) => q.judgments.forEach((_j, ji) => items.push({ qi, ji })));

const saved = new Map(); // `${queryPacketKey}|${packetKey}` -> judgment record
if (fs.existsSync(judgmentsPath)) {
  for (const line of fs.readFileSync(judgmentsPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const r = JSON.parse(line);
    saved.set(`${r.queryPacketKey}|${r.packetKey}`, r);
  }
}

function persist() {
  fs.writeFileSync(judgmentsPath, [...saved.values()].map((r) => JSON.stringify(r)).join('\n') + (saved.size ? '\n' : ''), 'utf8');
  const merged = queue.map((q) => ({
    ...q,
    reviewStatus: q.judgments.every((j) => saved.has(`${q.queryPacketKey}|${j.packetKey}`)) ? 'COMPLETE' : 'PENDING',
    judgments: q.judgments.map(({ display, ...j }) => {
      const s = saved.get(`${q.queryPacketKey}|${j.packetKey}`);
      return s ? { ...j, relevanceGrade: s.relevanceGrade, confidence: s.confidence, judgmentSource: s.judgmentSource,
        reviewerId: s.reviewerId, notes: s.notes ?? null, isHardNegative: s.isHardNegative === true } : j;
    }),
  }));
  fs.writeFileSync(judgedQueuePath, merged.map((m) => JSON.stringify(m)).join('\n') + '\n', 'utf8');
}

function view(index) {
  const { qi, ji } = items[index];
  const q = queue[qi];
  const j = q.judgments[ji];
  const s = saved.get(`${q.queryPacketKey}|${j.packetKey}`) ?? null;
  // Blind: only query text, candidate source_ref and excerpt. No run/rank/score/proxy hint.
  return {
    index, total: items.length, graded: saved.size,
    queryIndex: qi + 1, queryTotal: queue.length,
    queryText: q.queryText, querySourceRef: q.querySourceRef,
    candidate: { sourceRef: j.display?.sourceRef ?? '(unknown)', summary: j.display?.summary ?? '' },
    saved: s ? { relevanceGrade: s.relevanceGrade, confidence: s.confidence, notes: s.notes, isHardNegative: s.isHardNegative === true } : null,
  };
}

const page = `<!doctype html><meta charset="utf-8"><title>Golden relevance review</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;max-width:920px;margin:24px auto;padding:0 16px;background:#fafafa;color:#111}
@media(prefers-color-scheme:dark){body{background:#111;color:#eee}pre,.card{background:#1c1c1c!important;border-color:#333!important}}
.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px 16px;margin:12px 0}
pre{white-space:pre-wrap;word-break:break-word;background:#f3f3f3;padding:10px;border-radius:6px;max-height:340px;overflow:auto}
button{font:inherit;padding:6px 12px;margin:2px;cursor:pointer}button.on{outline:3px solid #2a7;font-weight:700}
.muted{opacity:.7;font-size:13px}
</style>
<div class="muted" id="prog"></div>
<div class="card"><b>Query</b> <span class="muted" id="qsrc"></span><pre id="q"></pre></div>
<div class="card"><b>Candidate file</b> <code id="cref"></code><pre id="csum"></pre></div>
<div class="card">
 <div>Grade: <span id="grades"></span></div>
 <div>Confidence: <button data-c="0.4">low</button><button data-c="0.7">medium</button><button data-c="1">high</button></div>
 <div>Reviewer id: <input id="rev" size="18"> <label><input type="checkbox" id="hn"> hard negative (looks related, is not)</label></div>
 <div><input id="notes" size="70" placeholder="notes (optional)"></div>
 <div class="muted">Keys: 0-3 grade, h hard negative, j/&darr; next, k/&uarr; previous, s skip, ? help. Autosaves on grade.</div>
</div>
<div><button id="prev">Prev</button><button id="next">Next</button></div>
<div class="card muted" id="help" hidden>0 irrelevant, 1 marginal, 2 relevant, 3 highly relevant. Judge whether the CANDIDATE FILE (and its summary) is relevant to the query's information need. Unit of judgment is the source file. Do not guess which system retrieved it.</div>
<script>
let i=+(localStorage.gr_i||0), cur=null, conf=0.7;
const $=id=>document.getElementById(id);
$('rev').value=localStorage.gr_rev||${JSON.stringify(defaultReviewer)};
$('rev').oninput=()=>localStorage.gr_rev=$('rev').value;
for(const g of [0,1,2,3]){const b=document.createElement('button');b.textContent=g;b.dataset.g=g;b.onclick=()=>grade(g);$('grades').append(b)}
document.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{conf=+b.dataset.c;paint()});
async function load(n){const r=await fetch('/api/review/'+n);cur=await r.json();i=cur.index;localStorage.gr_i=i;
 $('prog').textContent='Item '+(i+1)+' / '+cur.total+'  |  graded '+cur.graded+'  |  query '+cur.queryIndex+' / '+cur.queryTotal;
 $('q').textContent=cur.queryText;$('qsrc').textContent='('+cur.querySourceRef+')';$('cref').textContent=cur.candidate.sourceRef;$('csum').textContent=cur.candidate.summary;
 conf=cur.saved?cur.saved.confidence:0.7;$('notes').value=cur.saved?.notes||'';$('hn').checked=!!cur.saved?.isHardNegative;paint()}
function paint(){document.querySelectorAll('[data-g]').forEach(b=>b.classList.toggle('on',cur.saved&&cur.saved.relevanceGrade==b.dataset.g));
 document.querySelectorAll('[data-c]').forEach(b=>b.classList.toggle('on',+b.dataset.c===conf))}
async function grade(g){if(!$('rev').value.trim()){alert('Enter a reviewer id first');$('rev').focus();return}
 const hn=$('hn').checked;if(hn&&g!==0){alert('Hard negatives must be grade 0');return}
 await fetch('/api/review/'+i,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({relevanceGrade:g,confidence:conf,reviewerId:$('rev').value.trim(),notes:$('notes').value||null,isHardNegative:hn})});
 await load(Math.min(i+1,cur.total-1))}
$('next').onclick=()=>load(Math.min(i+1,cur.total-1));$('prev').onclick=()=>load(Math.max(i-1,0));
addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;
 if('0123'.includes(e.key))grade(+e.key);else if(e.key==='h'){$('hn').checked=true;grade(0)}
 else if(e.key==='j'||e.key==='ArrowDown'||e.key==='s')$('next').click();else if(e.key==='k'||e.key==='ArrowUp')$('prev').click();
 else if(e.key==='?')$('help').hidden=!$('help').hidden});
load(Math.min(i,${items.length}-1));
</script>`;

const server = http.createServer((req, res) => {
  const m = req.url.match(/^\/api\/review\/(\d+)$/);
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page); }
  if (m) {
    const index = Number(m[1]);
    if (!items[index]) { res.writeHead(404); return res.end('{}'); }
    if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(view(index))); }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const b = JSON.parse(body);
          const { qi, ji } = items[index];
          const q = queue[qi];
          const j = q.judgments[ji];
          if (!Number.isInteger(b.relevanceGrade) || b.relevanceGrade < 0 || b.relevanceGrade > 3) throw new Error('grade 0-3');
          if (typeof b.confidence !== 'number' || b.confidence < 0 || b.confidence > 1) throw new Error('confidence 0-1');
          if (!b.reviewerId) throw new Error('reviewerId required');
          if (b.isHardNegative && b.relevanceGrade !== 0) throw new Error('hard negative must be grade 0');
          saved.set(`${q.queryPacketKey}|${j.packetKey}`, {
            schema: 'atlas.golden-relevance-judgment.v1', queryPacketKey: q.queryPacketKey, packetKey: j.packetKey,
            evaluationUnit: 'SOURCE_FILE', relevanceGrade: b.relevanceGrade, confidence: b.confidence,
            judgmentSource: 'HUMAN_REVIEWED', trainingEligible: true, reviewerId: b.reviewerId,
            notes: b.notes ?? null, isHardNegative: b.isHardNegative === true, judgedAt: new Date().toISOString(),
          });
          persist();
          res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
        } catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message) })); }
      });
      return;
    }
  }
  res.writeHead(404); res.end();
});
server.listen(port, '127.0.0.1', () => {
  console.log(`golden review: http://127.0.0.1:${port}  items=${items.length} queries=${queue.length}${pilot ? ` (PILOT ${pilot})` : ''} graded=${saved.size}`);
  console.log(`writes: ${path.relative(repoRoot, judgmentsPath)} and ${path.relative(repoRoot, judgedQueuePath)}`);
});
