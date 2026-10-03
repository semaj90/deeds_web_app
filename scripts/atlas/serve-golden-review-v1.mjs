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
const allQueue = fs.readFileSync(queuePath, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

// GATE-00F0: query eligibility. Only VALID queries are graded; the pilot takes the first N VALID queries (not necessarily the first N).
const ELIGIBILITY_STATUSES = ['VALID', 'UNCLEAR', 'INVALID_META_PROMPT', 'INVALID_ARTIFACT'];
const eligibilityPath = path.join(outDir, 'golden-query-eligibility-v1.ndjson');
const eligibility = new Map();
if (fs.existsSync(eligibilityPath)) {
  for (const line of fs.readFileSync(eligibilityPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const r = JSON.parse(line);
    eligibility.set(r.queryPacketKey, r);
  }
}
function suggest(text) {
  if (/^\s*(the request is|the user (wants|is asking)|please\b|summari[sz]e (the|this))/i.test(text) || /concise sentences?/i.test(text)) return 'INVALID_META_PROMPT';
  if (text.trim().length < 25) return 'UNCLEAR';
  return null;
}
let queue = [];
let items = []; // flat, stable review order: query by query
function rebuild() {
  let valid = allQueue.filter((q) => eligibility.get(q.queryPacketKey)?.status === 'VALID');
  if (pilot > 0) valid = valid.slice(0, pilot);
  queue = valid;
  items = [];
  queue.forEach((q, qi) => q.judgments.forEach((_j, ji) => items.push({ qi, ji })));
}
rebuild();

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
async function load(n){const r=await fetch('/api/review/'+n);if(r.status===404){document.body.innerHTML='<p>No VALID queries yet. <a href="/eligibility">Mark query eligibility first (GATE-00F0)</a>.</p>';return}cur=await r.json();i=cur.index;localStorage.gr_i=i;
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
load(Math.max(0,Math.min(i,${items.length}-1)));
</script>`;

const eligibilityPage = `<!doctype html><meta charset="utf-8"><title>Query eligibility</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;max-width:980px;margin:24px auto;padding:0 16px;background:#fafafa;color:#111}
@media(prefers-color-scheme:dark){body{background:#111;color:#eee}pre,.card{background:#1c1c1c!important;border-color:#333!important}}
.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px 14px;margin:10px 0}
pre{white-space:pre-wrap;word-break:break-word;background:#f3f3f3;padding:8px;border-radius:6px;max-height:160px;overflow:auto;margin:6px 0}
.muted{opacity:.7;font-size:13px}.sug{color:#b60;font-weight:600}
label{margin-right:12px;cursor:pointer}
</style>
<h2>Query eligibility (GATE-00F0)</h2>
<div class="muted">Mark each query VALID (a real search need), UNCLEAR, INVALID_META_PROMPT (an instruction to a summarizer, not a search) or INVALID_ARTIFACT (garbled/truncated). Only VALID queries are graded. <a href="/">Start grading</a></div>
<div>Reviewer id: <input id="rev" size="18"> <span id="count" class="muted"></span></div>
<div id="list"></div>
<script>
const \$=id=>document.getElementById(id);
\$('rev').value=localStorage.gr_rev||'';\$('rev').oninput=()=>localStorage.gr_rev=\$('rev').value;
const ST=['VALID','UNCLEAR','INVALID_META_PROMPT','INVALID_ARTIFACT'];
let data=[];
function count(){const v=data.filter(d=>d.status==='VALID').length,u=data.filter(d=>!d.status).length;\$('count').textContent=v+' valid, '+u+' undecided of '+data.length}
async function save(d,status){if(!\$('rev').value.trim()){alert('Enter a reviewer id first');return false}
 const r=await fetch('/api/eligibility',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({queryPacketKey:d.queryPacketKey,status,reviewerId:\$('rev').value.trim()})});
 if(r.ok){d.status=status;count();return true}alert('save failed');return false}
(async()=>{data=await (await fetch('/api/eligibility')).json();
 data.forEach((d,i)=>{const c=document.createElement('div');c.className='card';
  const t=document.createElement('div');t.textContent='#'+(i+1)+'  '+d.querySourceRef+(d.suggested?'   ':'');c.append(t);
  if(d.suggested){const s=document.createElement('span');s.className='sug';s.textContent='suggested: '+d.suggested+' (not applied)';t.append(s)}
  const pre=document.createElement('pre');pre.textContent=d.queryText;c.append(pre);
  for(const st of ST){const l=document.createElement('label');const r=document.createElement('input');r.type='radio';r.name='q'+i;r.checked=d.status===st;
   r.onchange=async()=>{if(!(await save(d,st)))r.checked=false};l.append(r,' '+st);c.append(l)}
  \$('list').append(c)});count()})();
</script>`;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/eligibility') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(eligibilityPage); }
  if (req.url === '/api/eligibility') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(allQueue.map((q) => ({
        queryPacketKey: q.queryPacketKey, querySourceRef: q.querySourceRef, queryText: q.queryText,
        suggested: suggest(q.queryText), status: eligibility.get(q.queryPacketKey)?.status ?? null,
      }))));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const b = JSON.parse(body);
          if (!allQueue.some((q) => q.queryPacketKey === b.queryPacketKey)) throw new Error('unknown query');
          if (!ELIGIBILITY_STATUSES.includes(b.status)) throw new Error('bad status');
          if (!b.reviewerId) throw new Error('reviewerId required');
          eligibility.set(b.queryPacketKey, {
            schema: 'atlas.golden-query-eligibility.v1', queryPacketKey: b.queryPacketKey, status: b.status,
            reviewerId: b.reviewerId, judgedAt: new Date().toISOString(),
          });
          fs.writeFileSync(eligibilityPath, [...eligibility.values()].map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
          rebuild();
          res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
        } catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message) })); }
      });
      return;
    }
  }
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
  console.log(`golden review: http://127.0.0.1:${port}  eligible items=${items.length} valid queries=${queue.length}/${allQueue.length}${pilot ? ` (PILOT: first ${pilot} VALID)` : ''} graded=${saved.size}`);
  console.log(`open http://127.0.0.1:${port}/eligibility first to mark query eligibility (only VALID queries are graded)`);
  console.log(`writes: ${path.relative(repoRoot, judgmentsPath)} and ${path.relative(repoRoot, judgedQueuePath)}`);
});
