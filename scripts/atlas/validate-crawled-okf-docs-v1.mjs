#!/usr/bin/env node
/**
 * Validate crawled /docs/.okf documentation (oaklib, ast-grep, ts-morph, trpc by default). READ ONLY: never crawls, embeds, or writes any datastore.
 *
 * Offline (default): artifact integrity (unique ids/revisions, checksums, non-empty, canonical_authority=false) + crawl-fidelity defects
 *   (language-less fences, language label leaked into the code body, UI "Copy" suffix, site chrome, thin pages) + code-block syntax via the
 *   native ast-grep binary (`kind: ERROR` rule; python REPL transcripts have their prompts/outputs stripped first).
 * --live: also compares ast-grep with the tree-sitter FastAPI sidecar (:8095 /ast/chunk, explicit "Tree-sitter ERROR" diagnostic, NOT the
 *   sidecar `status`, which reports chunk extraction), probes /pos, grounds N Ornith 1.5 summaries on :8090 (stream:true; every reported
 *   identifier must appear verbatim in the chunk), and checks the Windows-native Tesseract install.
 * Writes docs/reports/okf-crawled-docs-validation-v1.json. Exit 1 on integrity FAIL or any ast-grep/sidecar syntax disagreement.
 *   node scripts/atlas/validate-crawled-okf-docs-v1.mjs [--sources a,b] [--live] [--samples 4]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const SOURCES = (arg('--sources', 'oaklib,ast-grep,ts-morph,trpc')).split(',');
const LIVE = process.argv.includes('--live');
const SAMPLES = Number(arg('--samples', '4'));
const REPORT = path.join(ROOT, 'docs/reports/okf-crawled-docs-validation-v1.json');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

const AG_LANG = { ts: 'ts', typescript: 'ts', tsx: 'tsx', js: 'js', javascript: 'js', python: 'python', yaml: 'yaml', yml: 'yaml', bash: 'bash', shell: 'bash', sh: 'bash', json: 'json' };
const AG_EXT = { ts: 'ts', tsx: 'tsx', js: 'js', python: 'py', yaml: 'yaml', bash: 'sh', json: 'json' };
const SIDE_LANG = { ts: 'typescript', typescript: 'typescript', js: 'javascript', javascript: 'javascript', python: 'python' };
const CHROME = [/skip to main content/i, /^on this page$/im, /\bedit this page\b/i];

function agBinary() {
  const npmShim = path.join(process.env.APPDATA ?? '', 'npm/node_modules/@ast-grep/cli/ast-grep.exe');
  return process.env.AST_GREP_BIN ?? (fs.existsSync(npmShim) ? npmShim : 'ast-grep');
}
const AG = agBinary();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-validate-'));
function astGrepErrors(lang, code) {
  const file = path.join(tmp, `b.${AG_EXT[lang]}`);
  fs.writeFileSync(file, code);
  const r = spawnSync(AG, ['scan', '--inline-rules', `id: parse-error\nlanguage: ${lang}\nrule:\n  kind: ERROR\n`, '--json=compact', file], { encoding: 'utf8', cwd: tmp });
  if (r.error || (r.status !== 0 && r.status !== 1)) return null; // tool failure, never counted as clean or broken
  try { return JSON.parse(r.stdout || '[]').filter((x) => x.ruleId === 'parse-error').length; } catch { return null; }
}
/** Strip python REPL transcripts: keep only `>>> ` / `... ` input lines, drop printed output. */
function stripRepl(code) {
  if (!/^>>> /m.test(code)) return code;
  return code.split('\n').filter((l) => l.startsWith('>>> ') || l.startsWith('... ') || l === '...').map((l) => l.slice(4)).join('\n');
}
async function sidecarSyntaxError(language, source) {
  try {
    const r = await fetch('http://127.0.0.1:8095/ast/chunk', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ source, language, filePath: `probe.${language === 'python' ? 'py' : language === 'typescript' ? 'ts' : 'js'}`, sourceRevision: 'validate-crawled-okf-docs-v1' }) });
    if (!r.ok) return null;
    return ((await r.json()).diagnostics ?? []).some((d) => /Tree-sitter ERROR/.test(d));
  } catch { return null; }
}

const report = { schema: 'atlas.okf-crawled-docs-validation.v1', generatedAt: new Date().toISOString(), live: LIVE, canonicalAuthority: false, writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0 }, sources: {}, live_checks: null, result: 'PASS' };
let hardFail = false;

for (const src of SOURCES) {
  const dir = path.join(ROOT, 'docs/.okf', src);
  const chunks = fs.readFileSync(path.join(dir, 'chunks.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const pages = fs.readdirSync(path.join(dir, 'raw')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, 'raw', f), 'utf8')));
  const integrity = {
    chunks: chunks.length, pages: pages.length,
    duplicateChunkIds: chunks.length - new Set(chunks.map((c) => c.chunk_id)).size,
    duplicateEvidenceRevisions: chunks.length - new Set(chunks.map((c) => c.chunk_evidence_revision)).size,
    emptyChunks: chunks.filter((c) => !c.text.trim()).length,
    checksumMismatch: chunks.filter((c) => sha(c.text) !== c.chunk_checksum).length,
    canonicalAuthorityTrue: chunks.filter((c) => c.canonical_authority).length,
  };
  integrity.result = integrity.duplicateChunkIds || integrity.duplicateEvidenceRevisions || integrity.emptyChunks || integrity.checksumMismatch || integrity.canonicalAuthorityTrue ? 'FAIL' : 'PASS';
  if (integrity.result === 'FAIL') hardFail = true;

  const fetchers = [...new Set(pages.map((p) => p.fetcher))];
  const fidelity = { fetchers, thinPagesUnder1KB: 0, chromeChunks: 0, languageLessFences: 0, leadingLanguageLabelInBody: 0, copySuffixBlocks: 0, blocks: 0 };
  for (const p of pages) if (fs.statSync(path.join(dir, 'raw', path.basename(p.markdown_path))).size < 1024) fidelity.thinPagesUnder1KB++;
  const syntax = { checked: 0, astGrepClean: 0, astGrepErrors: 0, toolFailures: 0, skippedNoLanguage: 0, sidecarCompared: 0, disagreements: [] };
  for (const c of chunks) {
    if (CHROME.some((re) => re.test(c.text))) fidelity.chromeChunks++;
    for (const b of c.code_blocks) {
      fidelity.blocks++;
      let lang = (b.language ?? '').toLowerCase(); let code = b.code;
      const first = code.split('\n')[0].trim().toLowerCase();
      if (!lang && AG_LANG[first]) { lang = first; code = code.split('\n').slice(1).join('\n'); fidelity.leadingLanguageLabelInBody++; }
      if (!lang) { fidelity.languageLessFences++; syntax.skippedNoLanguage++; }
      if (/Copy$/m.test(code)) fidelity.copySuffixBlocks++;
      const g = AG_LANG[lang]; if (!g) continue;
      const parsed = g === 'python' ? stripRepl(code) : code;
      const errors = astGrepErrors(g, parsed);
      syntax.checked++;
      if (errors === null) { syntax.toolFailures++; continue; }
      errors === 0 ? syntax.astGrepClean++ : syntax.astGrepErrors++;
      if (LIVE && SIDE_LANG[lang]) {
        const sideErr = await sidecarSyntaxError(SIDE_LANG[lang], parsed);
        if (sideErr !== null) { syntax.sidecarCompared++; if ((errors > 0) !== sideErr) syntax.disagreements.push({ chunk: c.chunk_id, lang, astGrepErrors: errors, sidecarTreeSitterError: sideErr, snippet: parsed.slice(0, 80) }); }
      }
    }
  }
  if (syntax.disagreements.length) hardFail = true;
  report.sources[src] = { integrity, fidelity, syntax };
}

if (LIVE) {
  const live = { tesseract: null, sidecarPos: null, ornithGrounding: [] };
  const t = spawnSync('C:\\Program Files\\Tesseract-OCR\\tesseract.exe', ['--version'], { encoding: 'utf8' });
  live.tesseract = t.error ? { available: false } : { available: true, version: (t.stdout || t.stderr).split('\n')[0].trim(), note: 'languages: ' + (spawnSync('C:\\Program Files\\Tesseract-OCR\\tesseract.exe', ['--list-langs'], { encoding: 'utf8' }).stdout || '').split('\n').slice(1).filter(Boolean).join(',') };
  const sample = SOURCES.flatMap((s) => fs.readFileSync(path.join(ROOT, 'docs/.okf', s, 'chunks.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((c) => c.text.length > 400 && c.code_blocks.length).slice(0, 1)).slice(0, SAMPLES);
  live.sidecarPos = await fetch('http://127.0.0.1:8095/pos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: sample[0]?.text.slice(0, 800) ?? 'probe' }), signal: AbortSignal.timeout(30000) }).then((r) => ({ status: r.status })).catch((e) => ({ error: String(e).slice(0, 60) }));
  for (const c of sample) {
    try {
      const r = await fetch('http://127.0.0.1:8090/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ model: 'ornith-1.5-9b', stream: true, max_tokens: 400, temperature: 0, messages: [{ role: 'user', content: `Summarize this documentation excerpt in at most 2 sentences, then list up to 6 code identifiers that appear VERBATIM in it. Reply as JSON: {"summary": string, "identifiers": string[]}.\n\n${c.text.slice(0, 1400)}` }] }) });
      let out = ''; let buf = ''; const dec = new TextDecoder();
      for await (const piece of r.body) { buf += dec.decode(piece, { stream: true }); const lines = buf.split('\n'); buf = lines.pop(); for (const l of lines) { if (!l.startsWith('data:') || l.includes('[DONE]')) continue; try { out += JSON.parse(l.slice(5)).choices?.[0]?.delta?.content ?? ''; } catch { /* keep-alive */ } } }
      const m = out.match(/\{[\s\S]*\}/); let j = null; try { j = m && JSON.parse(m[0]); } catch { /* ungrounded */ }
      const ids = j?.identifiers ?? [];
      live.ornithGrounding.push({ chunk: c.chunk_id, jsonOk: Boolean(j), identifiers: ids.length, grounded: ids.filter((i) => c.text.includes(i)).length });
    } catch (e) { live.ornithGrounding.push({ chunk: c.chunk_id, error: String(e).slice(0, 60) }); }
  }
  report.live_checks = live;
}

report.result = hardFail ? 'FAIL' : 'PASS';
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
for (const [s, v] of Object.entries(report.sources)) {
  console.log(`${s.padEnd(9)} integrity=${v.integrity.result} chunks=${v.integrity.chunks} | syntax checked=${v.syntax.checked} clean=${v.syntax.astGrepClean} err=${v.syntax.astGrepErrors} sidecarCompared=${v.syntax.sidecarCompared} disagree=${v.syntax.disagreements.length} | fidelity fetchers=${v.fidelity.fetchers} langLessFences=${v.fidelity.languageLessFences}/${v.fidelity.blocks} leadLabel=${v.fidelity.leadingLanguageLabelInBody} copySuffix=${v.fidelity.copySuffixBlocks} chromeChunks=${v.fidelity.chromeChunks} thinPages=${v.fidelity.thinPagesUnder1KB}`);
}
if (report.live_checks) console.log('live', JSON.stringify(report.live_checks));
console.log(`result=${report.result} report=${path.relative(ROOT, REPORT)}`);
process.exitCode = hardFail ? 1 : 0;
