#!/usr/bin/env node
/**
 * SEMANTIC-DOC-02 negative fixtures (deterministic, NOT a GAN): corrupt ONE property of a copy of the prepared envelopes and require the real gate
 * (validate-tooling-doc-admission-envelopes-v1.mts, via ENVELOPES_PATH/REPORT_PATH overrides) to FAIL with the expected check. Read only; writes
 * only to a temp directory. Run from the repo root: node scripts/atlas/validate-tooling-doc-admission-envelopes-negative-v1.mjs
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/.okf/dev/tooling-docs.admission-envelopes-v1.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doc02-neg-'));
const clone = () => JSON.parse(JSON.stringify(base));
const fixtures = [
  { name: 'wrong chunk checksum', expect: 'checksums and evidence revisions', mutate: (e) => { e[0].chunks[0].chunkChecksum = '0'.repeat(64); } },
  { name: 'altered chunk text', expect: 'every chunk resolves', mutate: (e) => { e[0].chunks[0].text += ' tampered'; } },
  { name: 'duplicate page identity', expect: 'no duplicate canonical source identity', mutate: (e) => { e.push(JSON.parse(JSON.stringify(e[0]))); } },
  { name: 'superseded Firecrawl fetcher marked admissible', expect: 'superseded Firecrawl tRPC corpus is excluded', mutate: (e) => { const t = e.find((x) => x.sourceId === 'trpc'); t.page.fetcher = 'FIRECRAWL_V2'; } },
  { name: 'chunk points at the wrong parent page', expect: 'every chunk resolves', mutate: (e) => { e[0].page.url = e[1].page.url; } },
  { name: 'stale evidence revision', expect: 'checksums and evidence revisions', mutate: (e) => { e[0].chunks[0].evidenceRevision = 'sha256:' + '1'.repeat(64); } },
  { name: 'unknown source namespace', expect: 'sources are exactly', mutate: (e) => { e[0].sourceId = 'trpc-beautifulsoup-r2'; } },
];
let failed = 0;
for (const [i, f] of fixtures.entries()) {
  const env = clone(); f.mutate(env);
  const inFile = path.join(tmp, `env-${i}.json`); const reportFile = path.join(tmp, `report-${i}.json`);
  fs.writeFileSync(inFile, JSON.stringify(env));
  const r = spawnSync('npx', ['tsx', '../scripts/atlas/validate-tooling-doc-admission-envelopes-v1.mts'], { cwd: path.join(ROOT, 'sveltekit-frontend'), encoding: 'utf8', shell: true, env: { ...process.env, ENVELOPES_PATH: inFile, REPORT_PATH: reportFile } });
  const failedChecks = (r.stdout ?? '').split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(6));
  const ok = r.status === 1 && failedChecks.some((c) => c.includes(f.expect));
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  rejects: ${f.name}  [exit=${r.status} failedChecks=${failedChecks.length}]`);
}
console.log(failed === 0 ? `NEGATIVE_FIXTURES_PASS ${fixtures.length}/${fixtures.length}` : `NEGATIVE_FIXTURES_FAIL ${failed} of ${fixtures.length} not rejected`);
process.exitCode = failed ? 1 : 0;
