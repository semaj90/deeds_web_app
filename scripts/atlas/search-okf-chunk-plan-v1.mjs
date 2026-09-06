#!/usr/bin/env node
/** Bounded lexical search over the pre-admission UTF-8 chunk plan. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).filter((x) => x.startsWith('--')).map((x) => { const [k, ...v] = x.slice(2).split('='); return [k, v.join('=') || true]; }));
const planPath = path.resolve(ROOT, String(args.get('plan') || 'docs/reports/okf-chunk-plan-v1.json'));
const query = String(args.get('query') || 'documentation retrieval error fixing');
const topK = Math.max(1, Number(args.get('top-k') || 10));
const output = path.resolve(ROOT, String(args.get('output') || 'docs/reports/okf-lexical-search-v1.json'));
const tokenise = (text) => text.toLowerCase().match(/[a-z0-9_:-]{2,}/g) || [];
const queryTerms = [...new Set(tokenise(query))];
const plan = JSON.parse(await readFile(planPath, 'utf8'));
if (plan.schema !== 'atlas.okf-chunk-plan.v1' || plan.canonicalAuthority !== false) throw new Error('CHUNK_PLAN_NOT_PRE_ADMISSION');
const sourceRoot = path.resolve(ROOT, plan.scanRoot);
const sources = new Map((plan.sources || []).map((source) => [source.sourceRef, source]));
const chunks = [];
for (const row of plan.chunks || []) {
  const source = sources.get(row.sourceRef);
  if (!source) continue;
  const bytes = await readFile(path.join(sourceRoot, source.relativePath));
  const text = bytes.subarray(row.startByte, row.endByte).toString('utf8');
  const counts = new Map();
  for (const token of tokenise(text)) counts.set(token, (counts.get(token) || 0) + 1);
  const overlap = queryTerms.filter((term) => counts.has(term));
  const score = overlap.reduce((sum, term) => sum + Math.log1p(counts.get(term)), 0);
  chunks.push({ chunkId: row.chunkId, sourceRef: row.sourceRef, sourceRevision: row.sourceRevision, chunkChecksum: row.chunkChecksum, byteSpan: { startByte: row.startByte, endByte: row.endByte }, matchedTerms: overlap, lexicalScore: score, canonicalAuthority: false });
}
chunks.sort((a, b) => b.lexicalScore - a.lexicalScore || a.sourceRef.localeCompare(b.sourceRef));
const report = { schema: 'atlas.okf-lexical-search.v1', generatedAt: new Date().toISOString(), query, queryTerms, inputPlan: path.relative(ROOT, planPath).replaceAll('\\', '/'), workspaceRevision: plan.workspaceRevision, candidateCount: Math.min(topK, chunks.length), candidates: chunks.slice(0, topK), searchOwner: 'scripts/atlas/search-okf-chunk-plan-v1.mjs', canonicalAuthority: false, writesPerformed: false, datastoreWritesPerformed: false, externalNetworkCallsPerformed: false, note: 'BM25-style bounded diagnostic; PostgreSQL FTS/GIN remains the durable lexical owner.' };
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ report: path.relative(ROOT, output).replaceAll('\\', '/'), candidateCount: report.candidateCount, workspaceRevision: report.workspaceRevision, writesPerformed: false }, null, 2));
