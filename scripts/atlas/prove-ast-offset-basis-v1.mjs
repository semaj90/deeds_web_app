#!/usr/bin/env node
/**
 * AST_BF_18A isolated BOM/offset-basis proof.
 * Reuses SourceTextEnvelopeV1; it does not define another decoding or offset
 * conversion rule and performs no database or source writes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { decodeSourceTextEnvelope } from './lib/source-text-envelope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const candidatesPath = path.join(ROOT, '.tmp/atlas/ast-declaration-candidates-current-v1.jsonl');
const reportPath = path.join(ROOT, 'docs/reports/ast-offset-basis-proof-v1.json');
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const rows = [];
if (fs.existsSync(candidatesPath)) {
  const input = readline.createInterface({ input: fs.createReadStream(candidatesPath, 'utf8'), crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (Number(row.bom_bytes) > 0) rows.push(row);
    } catch { /* malformed lines remain the candidate producer's concern */ }
  }
}

const files = new Set();
const mismatches = [];
let shiftedPass = 0;
let unshiftedWouldDiffer = 0;
for (const row of rows) {
  const rawRef = String(row.raw_source_ref ?? '');
  try {
    const raw = fs.readFileSync(path.join(ROOT, rawRef));
    const envelope = decodeSourceTextEnvelope(raw, rawRef);
    files.add(rawRef);
    const start = Number(row.start_byte);
    const end = Number(row.end_byte);
    const parserSlice = envelope.parserBuffer.subarray(start, end).toString('utf8');
    const shiftedRawSlice = raw.subarray(start + envelope.bomBytes, end + envelope.bomBytes).toString('utf8');
    const unshiftedRawSlice = raw.subarray(start, end).toString('utf8');
    const shiftedMatchesParser = shiftedRawSlice === parserSlice;
    const unshiftedDiffers = unshiftedRawSlice !== parserSlice;
    if (shiftedMatchesParser) shiftedPass += 1;
    if (unshiftedDiffers) unshiftedWouldDiffer += 1;
    if (!shiftedMatchesParser || !unshiftedDiffers || row.offset_basis !== 'UTF8_PARSER_BUFFER_V1') {
      mismatches.push({ rawRef, start, end, bomBytes: envelope.bomBytes, offsetBasis: row.offset_basis ?? null, shiftedMatchesParser, unshiftedDiffers });
    }
  } catch (error) {
    mismatches.push({ rawRef, error: error instanceof Error ? error.message : String(error) });
  }
}

const status = rows.length > 0 && mismatches.length === 0 && shiftedPass === rows.length && unshiftedWouldDiffer === rows.length
  ? 'BOM_OFFSET_BASIS_PROVEN'
  : rows.length === 0 ? 'NO_BOM_CANDIDATES' : 'BOM_OFFSET_BASIS_REVIEW_REQUIRED';
const report = {
  schema: 'atlas.ast-offset-basis-proof.v1',
  generatedAt: new Date().toISOString(),
  sourceTextEncodingRevision: 'SOURCE-TEXT-ENCODING-01',
  offsetBasis: 'UTF8_PARSER_BUFFER_V1',
  lineBasis: 'ONE_BASED_STORAGE',
  candidatesArtifact: path.relative(ROOT, candidatesPath).replaceAll('\\', '/'),
  candidateRows: rows.length,
  bomFiles: files.size,
  shiftedRoundTrip: `${shiftedPass}/${rows.length}`,
  unshiftedWouldDiffer: `${unshiftedWouldDiffer}/${rows.length}`,
  mismatches,
  inputChecksum: sha256(rows.map((row) => JSON.stringify(row)).join('\n')),
  status,
  canonicalAuthority: false,
  writesPerformed: false,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, status, candidateRows: rows.length, bomFiles: files.size, writesPerformed: false }, null, 2));
process.exitCode = status === 'BOM_OFFSET_BASIS_PROVEN' ? 0 : 1;
