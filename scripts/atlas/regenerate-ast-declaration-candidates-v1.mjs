#!/usr/bin/env node
/**
 * Read-only regeneration of AST declaration candidates from CURRENT source bytes (AST-ID-06 / 14.3a step 1).
 *
 * Why: the older candidate artifacts store ast-grep UTF-16 character indices in `start_byte`/`end_byte`
 * (verified 2026-09-20: napi `range().start.index` is a char index) and predate the admitted workspace snapshot.
 * This script converts to TRUE byte offsets, verifies every span against the file bytes, and takes revisions only
 * from the admitted snapshot. Files that drifted from the snapshot (KNOW-09) or whose bytes do not hash to the
 * snapshot digest are skipped, never stamped.
 *
 * Writes only a scratch candidates file under .tmp/ and a small receipt under docs/reports/. No database access.
 * Usage: node scripts/atlas/regenerate-ast-declaration-candidates-v1.mjs [--prefix sveltekit-frontend/src/] [--limit-files N]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { normalizeAstSourceRefForPolicy } from './lib/ast-source-ref-policy.mjs';
import { decodeSourceTextEnvelope } from './lib/source-text-envelope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values: args } = parseArgs({ options: { prefix: { type: 'string', default: 'sveltekit-frontend/src/' }, 'limit-files': { type: 'string', default: '' } }, strict: false });
const PREFIX = String(args.prefix);
const LIMIT_FILES = Number(args['limit-files']) || Infinity;
const KNOW09 = path.join(ROOT, '.tmp/knowledge-source-snapshot-live-v1.json');
const OUT_JSONL = path.join(ROOT, '.tmp/atlas/ast-declaration-candidates-current-v1.jsonl');
const OUT_RECEIPT = path.join(ROOT, 'docs/reports/ast-declaration-candidates-current-v1.json');

const KIND_MAP = {
  function_declaration: 'function', class_declaration: 'class', abstract_class_declaration: 'class',
  interface_declaration: 'interface', type_alias_declaration: 'type', enum_declaration: 'enum', method_definition: 'method',
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const require = createRequire(path.join(ROOT, 'sveltekit-frontend/package.json'));
const napi = require('@ast-grep/napi');
const parserVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'sveltekit-frontend/node_modules/@ast-grep/napi/package.json'), 'utf8')).version;
const LANG_BY_EXT = { '.ts': napi.Lang.TypeScript, '.mts': napi.Lang.TypeScript, '.cts': napi.Lang.TypeScript, '.js': napi.Lang.JavaScript, '.mjs': napi.Lang.JavaScript, '.cjs': napi.Lang.JavaScript };

if (!fs.existsSync(KNOW09)) throw new Error(`KNOW-09 receipt missing: ${KNOW09} (needed for the admitted snapshot and drift set)`);
const know09 = JSON.parse(fs.readFileSync(KNOW09, 'utf8'));
const snapPath = fs.existsSync(know09.snapshotPath) ? know09.snapshotPath : path.join(ROOT, 'docs/reports/workspace-source-snapshots', `${String(know09.snapshotRevision).replace('sha256:', '')}.json`);
const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
const drift = new Set([...(know09.worktreeMismatchRefs ?? []), ...(know09.missingWorktreeRefs ?? [])].map((x) => String(x).toLowerCase()));

const stats = { sourcesInScope: 0, unsupportedExt: 0, driftSkipped: 0, fileMissing: 0, malformedEncoding: 0, bomFiles: 0, nonUtf8Sources: 0, digestDiverged: 0, parseError: 0, filesParsed: 0, candidates: 0, spanVerifyFailed: 0, nonAsciiFiles: 0, byKind: {} };
fs.mkdirSync(path.dirname(OUT_JSONL), { recursive: true });
const out = fs.createWriteStream(OUT_JSONL, { encoding: 'utf8' });
let filesSeen = 0;
const digestDivergedRefs = [];
const bomProof = { candidates: 0, rawShiftedRoundTrip: 0, rawShiftedMismatch: 0, rawUnshiftedWouldBeWrong: 0 };
const sources = snap.sources.filter((s) => String(s.sourceRef).startsWith(PREFIX)).sort((a, b) => String(a.sourceRef).localeCompare(String(b.sourceRef)));
for (const s of sources) {
  if (filesSeen >= LIMIT_FILES) break;
  stats.sourcesInScope += 1;
  const lang = LANG_BY_EXT[path.extname(s.sourceRef).toLowerCase()];
  if (!lang) { stats.unsupportedExt += 1; continue; }
  filesSeen += 1;
  if (drift.has(String(s.sourceRef).toLowerCase())) { stats.driftSkipped += 1; continue; }
  let buf;
  try { buf = fs.readFileSync(path.join(ROOT, s.sourceRef)); } catch { stats.fileMissing += 1; continue; }
  // SOURCE-TEXT-ENCODING-01 owner: BOM/UTF-16 aware, fail-closed, offsets are against the normalized UTF-8 parserBuffer.
  let env;
  try { env = decodeSourceTextEnvelope(buf, s.sourceRef); } catch { stats.malformedEncoding += 1; continue; }
  if (env.rawContentHash !== s.contentDigest) {
    stats.digestDiverged += 1;
    // AST_BF_18B: classify, never stamp. Distinguish "already known drift" from "changed since the KNOW-09 receipt".
    digestDivergedRefs.push({ sourceRef: s.sourceRef, snapshotDigest: s.contentDigest, currentRawDigest: env.rawContentHash, inKnow09DriftList: drift.has(String(s.sourceRef).toLowerCase()), bytes: buf.length, snapshotBytes: s.byteLength ?? null, classification: 'CHANGED_SINCE_ADMITTED_SNAPSHOT_NOT_IN_KNOW09_LIST' });
    continue;
  }
  const text = env.text;
  const parserBuf = env.parserBuffer;
  if (/[^\x00-\x7f]/.test(text)) stats.nonAsciiFiles += 1;
  if (env.bomBytes) stats.bomFiles += 1;
  if (env.sourceEncoding !== 'utf-8') stats.nonUtf8Sources += 1;
  let root;
  try { root = napi.parse(lang, text).root(); } catch { stats.parseError += 1; continue; }
  stats.filesParsed += 1;
  const canonical = normalizeAstSourceRefForPolicy(s.sourceRef);
  const rows = [];
  for (const [astKind, kind] of Object.entries(KIND_MAP)) {
    let nodes;
    try { nodes = root.findAll({ rule: { kind: astKind } }); } catch { continue; }
    for (const node of nodes) {
      const name = node.field('name')?.text();
      if (!name) continue;
      const r = node.range();
      const startByte = Buffer.byteLength(text.slice(0, r.start.index), 'utf8');
      const endByte = Buffer.byteLength(text.slice(0, r.end.index), 'utf8');
      if (parserBuf.subarray(startByte, endByte).toString('utf8') !== node.text()) { stats.spanVerifyFailed += 1; continue; }
      if (env.bomBytes) {
        // AST_BF_18A: BOM proof — coordinates are PARSER-BUFFER coordinates; the raw file is shifted by bomBytes.
        bomProof.candidates += 1;
        if (buf.subarray(startByte + env.bomBytes, endByte + env.bomBytes).toString('utf8') === node.text()) bomProof.rawShiftedRoundTrip += 1; else bomProof.rawShiftedMismatch += 1;
        if (buf.subarray(startByte, endByte).toString('utf8') !== node.text()) bomProof.rawUnshiftedWouldBeWrong += 1;
      }
      rows.push({
        source_ref: canonical, relative_path: canonical, raw_source_ref: s.sourceRef, symbol_name: name, symbol_kind: kind, ast_kind: astKind,
        start_byte: startByte, end_byte: endByte, start_char: r.start.index, end_char: r.end.index, start_line: r.start.line, end_line: r.end.line,
        source_revision: s.sourceRevision, workspace_revision: know09.workspaceRevision, workspace_id: snap.workspaceId, source_content_digest: s.contentDigest,
        source_encoding: env.sourceEncoding, bom_bytes: env.bomBytes, normalized_utf8_hash: env.normalizedUtf8Hash, offset_basis: 'UTF8_PARSER_BUFFER_V1', line_basis_source: 'ZERO_BASED_NAPI', source_text_encoding_revision: 'SOURCE-TEXT-ENCODING-01',
        parser_name: 'ast-grep-napi', parser_version: parserVersion,
      });
    }
  }
  rows.sort((a, b) => a.start_byte - b.start_byte || a.end_byte - b.end_byte || a.symbol_kind.localeCompare(b.symbol_kind));
  // Existing identity convention (verified 2026-09-20: 2,153/2,153 ids reproduce): a `file` row (parent NULL) owns top-level declarations.
  if (rows.length) {
    const lineCount = text.split('\n').length;
    rows.unshift({
      source_ref: canonical, relative_path: canonical, raw_source_ref: s.sourceRef, symbol_name: path.posix.basename(canonical), symbol_kind: 'file', ast_kind: 'source_file',
      start_byte: 0, end_byte: parserBuf.length, start_char: 0, end_char: text.length, start_line: 0, end_line: lineCount - 1,
      source_revision: s.sourceRevision, workspace_revision: know09.workspaceRevision, workspace_id: snap.workspaceId, source_content_digest: s.contentDigest,
      source_encoding: env.sourceEncoding, bom_bytes: env.bomBytes, normalized_utf8_hash: env.normalizedUtf8Hash, offset_basis: 'UTF8_PARSER_BUFFER_V1', line_basis_source: 'ZERO_BASED_NAPI', source_text_encoding_revision: 'SOURCE-TEXT-ENCODING-01',
      parser_name: 'ast-grep-napi', parser_version: parserVersion,
    });
  }
  for (const row of rows) { out.write(`${JSON.stringify(row)}\n`); stats.candidates += 1; stats.byKind[row.symbol_kind] = (stats.byKind[row.symbol_kind] ?? 0) + 1; }
}
await new Promise((resolve) => out.end(resolve));
const receipt = {
  schema: 'atlas.ast-declaration-candidates-current.v1', readOnly: true, databaseWrites: false, canonicalAuthority: false,
  generatedAt: new Date().toISOString(), prefix: PREFIX, snapshotRevision: snap.snapshotRevision, workspaceRevision: know09.workspaceRevision,
  parser: { name: 'ast-grep-napi', version: parserVersion, grammarVersion: null },
  offsetBasis: 'UTF8_PARSER_BUFFER_V1', lineBasis: 'ONE_BASED_STORAGE (napi is zero-based; +1 at storage)', sourceTextEncodingRevision: 'SOURCE-TEXT-ENCODING-01',
  offsetSemantics: 'UTF-8 byte offsets into the envelope parserBuffer (BOM stripped, normalized UTF-8), derived via Buffer.byteLength of the string prefix from napi UTF-16 indices; NOT raw-file offsets when bomBytes>0; every span verified against parserBuffer',
  bomProof: { ...bomProof, files: stats.bomFiles, status: bomProof.candidates > 0 && bomProof.rawShiftedMismatch === 0 && bomProof.rawShiftedRoundTrip === bomProof.candidates ? 'PASS' : (bomProof.candidates === 0 ? 'NO_BOM_CANDIDATES' : 'FAIL') },
  digestDivergedSources: digestDivergedRefs,
  output: path.relative(ROOT, OUT_JSONL), outputSha256: sha256(fs.readFileSync(OUT_JSONL)), stats,
};
fs.writeFileSync(OUT_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: 'OK', ...receipt }, null, 2));
