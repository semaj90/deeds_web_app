#!/usr/bin/env node
/**
 * Read-only Ornith summary leak smoke. Clusters the enriched index (domainClass / clusterId / somCell / extension),
 * samples the revision-qualified summary cohort stratified across clusters, calls the local llama-server with the
 * canary prompt/params, and checks every raw response for control tokens, reasoning text, echoed scaffold, placeholder
 * text and non-empty reasoning_content. Writes NOTHING to Postgres/Qdrant/Valkey; output is a receipt only.
 * Usage: node scripts/atlas/smoke-ornith-summary-leak-v1.mjs [--samples=48] [--per-cluster=2] [--out=docs/reports/ornith-summary-leak-smoke-v1.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { analyzeSummaryContaminationV1 } from './lib/summary-quality-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]; }));
const samples = Number(args.get('samples') ?? 48);
const perCluster = Number(args.get('per-cluster') ?? 2);
const baseUrl = args.get('base-url') ?? 'http://127.0.0.1:8090';
const enrichedDir = args.get('enriched') ?? '.tmp/atlas/current-enriched-index-summary-metadata-v1/20260925T211940Z';
const inputPath = args.get('input') ?? '.tmp/atlas/ornith-summary-input-current-v1.ndjson';
const maxBytes = 65536;

const lines = async (f, fn) => { const rl = readline.createInterface({ input: fs.createReadStream(path.resolve(ROOT, f), 'utf8'), crlfDelay: Infinity }); for await (const l of rl) if (l.trim()) fn(JSON.parse(l)); };
const ext = (r) => r.split('.').pop()?.toLowerCase() || 'none';

// 1. clusters over ALL indexed sources
const meta = new Map(); const dom = new Map(); const clu = new Map(); const som = new Map(); const ex = new Map(); let total = 0;
const bump = (m, k) => m.set(k ?? 'null', (m.get(k ?? 'null') ?? 0) + 1);
for (const f of fs.readdirSync(path.resolve(ROOT, enrichedDir)).filter((x) => x.endsWith('.ndjson')).sort()) {
  await lines(path.join(enrichedDir, f), (o) => { total++; meta.set(o.sourceRef, o); bump(dom, o.domainClass); bump(clu, o.clusterId); bump(som, o.somCell); bump(ex, ext(o.sourceRef)); });
}
const top = (m, n = 8) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);

// 2. stratified sample from the summary cohort (revision-qualified, has text)
const cohort = [];
await lines(inputPath, (o) => {
  if (o.revisionStatus !== 'PROVEN' || !o.content || Buffer.byteLength(o.content, 'utf8') > maxBytes) return;
  const m = meta.get(o.sourceRef);
  cohort.push({ ...o, cluster: `${m?.domainClass ?? 'null'}|${ext(o.sourceRef)}` });
});
const byCluster = new Map();
for (const r of cohort) { const l = byCluster.get(r.cluster) ?? []; l.push(r); byCluster.set(r.cluster, l); }
const picked = []; const groups = [...byCluster].sort((a, b) => b[1].length - a[1].length);
for (let round = 0; round < perCluster && picked.length < samples; round++) for (const [, list] of groups) { if (list[round] && picked.length < samples) picked.push(list[round]); }

// 3. Ornith calls + leak checks
const props = await (await fetch(`${baseUrl}/props`, { signal: AbortSignal.timeout(10000) })).json();
const modelId = String(props.model_alias ?? '');
if (!/ornith/i.test(modelId)) { console.error(`NOT_ORNITH:${modelId}`); process.exit(2); }
const prompt = 'Summarize only the supplied source artifact in one or two concise sentences. Describe what this source says or implements; do not claim that it describes the current repository/runtime unless the source itself establishes that. Preserve historical, tentative, and proposed status. Do not invent details, identities, revisions, or behavior. Return only the summary text.';
const results = []; const reasons = {}; let clean = 0; let reasoningContentNonEmpty = 0; let failures = 0;
for (const r of picked) {
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ model: modelId, messages: [{ role: 'system', content: prompt }, { role: 'user', content: `source_ref: ${r.sourceRef}\nsource_revision: ${r.sourceRevision}\nchunk content follows:\n\n${r.content}` }], temperature: 0, top_p: 1, seed: 20260925, max_tokens: 192, stream: false }),
    });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const msg = (await res.json()).choices?.[0]?.message ?? {};
    const text = msg.content ?? '';
    if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim()) reasoningContentNonEmpty++;
    const a = analyzeSummaryContaminationV1(text);
    if (a.clean) clean++; else for (const x of a.reasons) reasons[x] = (reasons[x] ?? 0) + 1;
    results.push({ sourceRef: r.sourceRef, cluster: r.cluster, clean: a.clean, reasons: a.reasons, chars: text.length });
  } catch (e) { failures++; results.push({ sourceRef: r.sourceRef, cluster: r.cluster, clean: null, reasons: [`CALL_FAILED:${String(e.message).slice(0, 40)}`], chars: 0 }); }
}
const receipt = {
  schema: 'atlas.ornith-summary-leak-smoke.v1', model: modelId, runtimeBuild: props.build_info ?? null,
  indexedSources: total, cohortEligible: cohort.length, sampled: picked.length, clustersSampled: new Set(picked.map((p) => p.cluster)).size,
  clean, contaminated: picked.length - clean - failures, callFailures: failures, reasoningContentNonEmpty, reasons,
  status: picked.length > 0 && clean === picked.length && failures === 0 && reasoningContentNonEmpty === 0 ? 'NO_LEAK_IN_SAMPLE' : 'LEAK_OR_FAILURE_FOUND',
  clusters: { domainClass: top(dom), clusterId: top(clu), somCellDistinct: som.size, somCellTop: top(som, 5), extension: top(ex, 10) },
  results, scope: 'sample only; not all indexed files', databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0,
};
const out = path.resolve(ROOT, args.get('out') ?? 'docs/reports/ornith-summary-leak-smoke-v1.json');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ ...receipt, results: undefined }, null, 1));
process.exit(receipt.status === 'NO_LEAK_IN_SAMPLE' ? 0 : 1);
