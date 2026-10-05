#!/usr/bin/env node
/**
 * SEMANTIC-DOC-02 gate: tooling-doc admission-envelope preparation (READ ONLY; no Postgres/Qdrant/Valkey/Neo4j, no embedding, no authorization phrase).
 * PASS requires every check below; generating files is not a pass. It cross-checks docs/.okf/dev/tooling-docs.admission-envelopes-v1.json against the
 * committed acquired artifacts (docs/.okf/<source>/chunks.jsonl and raw/*.json) and the existing admission validator.
 * Run from sveltekit-frontend/:  npx tsx ../scripts/atlas/validate-tooling-doc-admission-envelopes-v1.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateExternalDocAdmissionHandoff } from '../../sveltekit-frontend/src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCES = ['oaklib', 'ast-grep', 'ts-morph', 'trpc'];
const EXCLUDED = ['trpc-firecrawl-r1', 'trpc-beautifulsoup-r2'];
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const jsonl = (f: string) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
// ENVELOPES_PATH / REPORT_PATH overrides exist so negative fixtures can run this exact gate on mutated copies without touching the committed report.
const envelopes: any[] = JSON.parse(fs.readFileSync(process.env.ENVELOPES_PATH ?? path.join(ROOT, 'docs/.okf/dev/tooling-docs.admission-envelopes-v1.json'), 'utf8'));
const checks: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = '') => checks.push({ name, pass, detail });

// artifacts
const chunksBySource = new Map<string, Map<string, any>>();
const rawBySource = new Map<string, any[]>();
for (const s of SOURCES) {
  chunksBySource.set(s, new Map(jsonl(path.join(ROOT, 'docs/.okf', s, 'chunks.jsonl')).map((c: any) => [c.chunk_id, c])));
  const rawDir = path.join(ROOT, 'docs/.okf', s, 'raw');
  rawBySource.set(s, fs.readdirSync(rawDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'))));
}

check('sources are exactly the four tooling-doc namespaces', JSON.stringify([...new Set(envelopes.map((e) => e.sourceId))].sort()) === JSON.stringify([...SOURCES].sort()), [...new Set(envelopes.map((e) => e.sourceId))].join(','));
const pageIdentity = envelopes.map((e) => [e.page.provider, e.page.product, e.page.productVersion, e.page.url].join('\u0000'));
check('no duplicate canonical source identity', new Set(pageIdentity).size === envelopes.length, `${envelopes.length} pages, ${new Set(pageIdentity).size} unique`);
check('every page has exactly one coordinate (unique page evidenceRevision + content hash present)',
  new Set(envelopes.map((e) => e.page.evidenceRevision)).size === envelopes.length && envelopes.every((e) => e.page.contentHash && e.page.provider && e.page.product && e.page.productVersion && e.page.url));
let noRaw = 0, multiRaw = 0;
for (const e of envelopes) { const hits = (rawBySource.get(e.sourceId) ?? []).filter((r) => r.resolved_url === e.page.url); if (hits.length === 0) noRaw++; if (hits.length > 1) multiRaw++; }
check('every coordinate resolves to exactly one acquired document', noRaw === 0 && multiRaw === 0, `unresolved=${noRaw} ambiguous=${multiRaw}`);
let chunkMissing = 0, textMismatch = 0, checksumMismatch = 0, revMismatch = 0, parentMismatch = 0, total = 0;
for (const e of envelopes) for (const c of e.chunks) {
  total++;
  const art = chunksBySource.get(e.sourceId)?.get(c.chunkId);
  if (!art) { chunkMissing++; continue; }
  if (art.text !== c.text) textMismatch++;
  if (sha(c.text) !== c.chunkChecksum || art.chunk_checksum !== c.chunkChecksum) checksumMismatch++;
  if (art.chunk_evidence_revision !== c.evidenceRevision) revMismatch++;
  if (art.source_url !== e.page.url) parentMismatch++;
}
check('every chunk resolves to the committed artifact and its parent document', chunkMissing + textMismatch + parentMismatch === 0, `chunks=${total} missing=${chunkMissing} textMismatch=${textMismatch} parentMismatch=${parentMismatch}`);
check('checksums and evidence revisions match the committed artifacts', checksumMismatch + revMismatch === 0, `checksumMismatch=${checksumMismatch} revisionMismatch=${revMismatch}`);
check('no envelope chunk was produced by a non-canonical artifact (canonical_authority=false on every source chunk)',
  SOURCES.every((s) => [...(chunksBySource.get(s)?.values() ?? [])].every((c: any) => c.canonical_authority === false)));
const r1Marker = path.join(ROOT, 'docs/.okf/trpc-firecrawl-r1/SUPERSEDED.json');
const r1ChunkIds = fs.existsSync(path.join(ROOT, 'docs/.okf/trpc-firecrawl-r1/chunks.jsonl')) ? new Set(jsonl(path.join(ROOT, 'docs/.okf/trpc-firecrawl-r1/chunks.jsonl')).map((c: any) => c.chunk_id)) : new Set();
const leakedFromSuperseded = envelopes.flatMap((e) => e.chunks).filter((c: any) => r1ChunkIds.has(c.chunkId)).length;
check('superseded Firecrawl tRPC corpus is excluded', fs.existsSync(r1Marker) && JSON.parse(fs.readFileSync(r1Marker, 'utf8')).status === 'SUPERSEDED' && leakedFromSuperseded === 0 && envelopes.every((e) => e.page.fetcher !== 'FIRECRAWL_V2'), `supersededMarker=${fs.existsSync(r1Marker)} leakedChunkIds=${leakedFromSuperseded}`);
check('foreign concurrent artifacts are excluded', EXCLUDED.slice(1).every((x) => !JSON.stringify(envelopes).includes(x)), EXCLUDED.slice(1).join(','));
const handoff: any = validateExternalDocAdmissionHandoff(envelopes);
check('existing admission validator accepts the envelopes', handoff.result === 'EXTERNAL_DOC_ADMISSION_HANDOFF_READY', String(handoff.result));

const pass = checks.every((c) => c.pass);
const report = { schema: 'atlas.semantic-doc-02-tooling-doc-envelope-gate.v1', generatedAt: new Date().toISOString(), result: pass ? 'SEMANTIC_DOC_02_PASS' : 'SEMANTIC_DOC_02_FAIL',
  pages: envelopes.length, chunks: total, canonicalAuthority: false, writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0 }, embeddingPerformed: false, authorizationPhraseUsed: false,
  next: 'operator review -> explicit authorization -> tiny canonical admission canary -> readback -> semantic_768 population (separate gates)', checks };
fs.writeFileSync(process.env.REPORT_PATH ?? path.join(ROOT, 'docs/reports/semantic-doc-02-tooling-doc-envelope-gate-v1.json'), JSON.stringify(report, null, 2) + '\n');
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(report.result, `pages=${envelopes.length} chunks=${total}`);
process.exitCode = pass ? 0 : 1;
