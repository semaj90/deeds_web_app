#!/usr/bin/env node
/**
 * convert-utf16le-dumps-to-utf8.mjs
 *
 * Streaming sidecar conversion: UTF-16 LE rg dump → UTF-8 mirror.
 * NEVER modifies originals in place.
 * Output: <basename>.utf8<ext> alongside original.
 *
 * Usage:
 *   node scripts/packets/convert-utf16le-dumps-to-utf8.mjs                     # dry-run all rg_*.txt
 *   node scripts/packets/convert-utf16le-dumps-to-utf8.mjs --apply             # write mirrors
 *   node scripts/packets/convert-utf16le-dumps-to-utf8.mjs file.txt --apply    # specific file(s)
 */

import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const DUMPS_DIR = path.join(ROOT, 'archive', 'raw-search-dumps');
const TMP_DIR = path.join(ROOT, '.tmp');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const fileArgs = argv.filter(a => !a.startsWith('--'));

// ── Helpers ──────────────────────────────────────────────────────────────────

function outputPathFor(inputPath) {
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  return path.join(path.dirname(inputPath), `${base}.utf8${ext}`);
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const read = fs.createReadStream(filePath);
  for await (const chunk of read) hash.update(chunk);
  return hash.digest('hex');
}

function fmtBytes(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' MB';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + ' KB';
  return n + ' B';
}

// ── Candidate discovery ───────────────────────────────────────────────────────

function discoverInputs() {
  if (fileArgs.length > 0) {
    return fileArgs.map(f => path.isAbsolute(f) ? f : path.join(DUMPS_DIR, f));
  }
  return fs.readdirSync(DUMPS_DIR)
    .filter(f => f.match(/^rg_.*\.txt$/) && !f.includes('.utf8.'))
    .map(f => path.join(DUMPS_DIR, f));
}

// ── Streaming converter ───────────────────────────────────────────────────────

async function convertFile(inputPath) {
  const outputPath = outputPathFor(inputPath);
  const tmpPath = outputPath + '.tmp';

  const stat = fs.statSync(inputPath);
  console.log(`\n→ ${path.basename(inputPath)} (${fmtBytes(stat.size)})`);
  console.log(`  output: ${path.basename(outputPath)}`);

  if (!APPLY) {
    console.log(`  [DRY-RUN] would write ${path.basename(outputPath)}`);
    return {
      input: inputPath,
      output: outputPath,
      inputBytes: stat.size,
      outputBytes: null,
      linesWritten: null,
      bomStripped: null,
      inputSha256: null,
      outputSha256: null,
      dryRun: true,
      error: null,
    };
  }

  // Already exists?
  if (fs.existsSync(outputPath)) {
    const outStat = fs.statSync(outputPath);
    console.log(`  [SKIP] mirror already exists (${fmtBytes(outStat.size)})`);
    return {
      input: inputPath,
      output: outputPath,
      inputBytes: stat.size,
      outputBytes: outStat.size,
      linesWritten: null,
      bomStripped: false,
      inputSha256: await sha256File(inputPath),
      outputSha256: await sha256File(outputPath),
      dryRun: false,
      skipped: true,
      error: null,
    };
  }

  let linesWritten = 0;
  let bomStripped = false;
  let firstChunk = true;

  const stripBomAndCount = new Transform({
    decodeStrings: false,
    encoding: 'utf8',
    transform(chunk, _enc, cb) {
      let text = chunk;
      if (firstChunk) {
        firstChunk = false;
        if (text.charCodeAt(0) === 0xfeff) {
          text = text.slice(1);
          bomStripped = true;
        }
      }
      linesWritten += (text.match(/\n/g) || []).length;
      cb(null, text);
    },
  });

  fs.mkdirSync(path.dirname(tmpPath), { recursive: true });

  const read = fs.createReadStream(inputPath);
  read.setEncoding('utf16le');
  const write = fs.createWriteStream(tmpPath, { encoding: 'utf8' });

  const startMs = Date.now();
  process.stdout.write('  converting... ');

  try {
    await pipeline(read, stripBomAndCount, write);
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    return {
      input: inputPath,
      output: outputPath,
      inputBytes: stat.size,
      outputBytes: null,
      linesWritten: null,
      bomStripped: null,
      inputSha256: null,
      outputSha256: null,
      dryRun: false,
      error: err.message,
    };
  }

  fs.renameSync(tmpPath, outputPath);
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  const outStat = fs.statSync(outputPath);

  console.log(`done (${elapsed}s)`);
  console.log(`  lines: ${linesWritten.toLocaleString()}  bom: ${bomStripped}`);
  console.log(`  in: ${fmtBytes(stat.size)}  out: ${fmtBytes(outStat.size)}`);

  const [inputSha256, outputSha256] = await Promise.all([
    sha256File(inputPath),
    sha256File(outputPath),
  ]);

  return {
    input: inputPath,
    output: outputPath,
    inputBytes: stat.size,
    outputBytes: outStat.size,
    linesWritten,
    bomStripped,
    inputSha256,
    outputSha256,
    dryRun: false,
    error: null,
  };
}

// ── Report writer ─────────────────────────────────────────────────────────────

function writeReports(results) {
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const jsonPath = path.join(TMP_DIR, 'utf8-dump-conversion-report.json');
  const mdPath = path.join(TMP_DIR, 'utf8-dump-conversion-report.md');

  const report = {
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    files: results,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\n  JSON report: ${jsonPath}`);

  const lines = [
    `# UTF-16 LE → UTF-8 Conversion Report`,
    ``,
    `Generated: ${report.generatedAt}  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`,
    ``,
    `| File | Input | Output | Lines | BOM | SHA-256 (in) | SHA-256 (out) |`,
    `|------|-------|--------|-------|-----|--------------|---------------|`,
  ];

  for (const r of results) {
    const inB = fmtBytes(r.inputBytes ?? 0);
    const outB = r.outputBytes != null ? fmtBytes(r.outputBytes) : '—';
    const lines_ = r.linesWritten != null ? r.linesWritten.toLocaleString() : '—';
    const bom = r.bomStripped == null ? '—' : r.bomStripped ? 'yes' : 'no';
    const sha_in = r.inputSha256 ? r.inputSha256.slice(0, 12) + '…' : '—';
    const sha_out = r.outputSha256 ? r.outputSha256.slice(0, 12) + '…' : '—';
    const name = path.basename(r.input);
    const status = r.error ? `ERROR: ${r.error}` : r.dryRun ? '[dry]' : (r.skipped ? '[skipped]' : '✓');
    lines.push(`| ${name} (${status}) | ${inB} | ${outB} | ${lines_} | ${bom} | ${sha_in} | ${sha_out} |`);
  }

  lines.push('');
  fs.writeFileSync(mdPath, lines.join('\n'));
  console.log(`  MD report:   ${mdPath}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[convert-utf16le] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const inputs = discoverInputs();
  if (inputs.length === 0) {
    console.log('No rg_*.txt files found in', DUMPS_DIR);
    process.exit(0);
  }

  console.log(`Found ${inputs.length} file(s) to process`);

  const results = [];
  for (const f of inputs) {
    const r = await convertFile(f);
    results.push(r);
    if (r.error) console.error(`  ERROR: ${r.error}`);
  }

  writeReports(results);

  const errors = results.filter(r => r.error).length;
  const done = results.filter(r => !r.dryRun && !r.error && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  console.log(`\n[convert-utf16le] done=${done}  skipped=${skipped}  errors=${errors}`);

  if (errors > 0) process.exit(1);
}

main().catch(e => {
  console.error('[convert-utf16le] FATAL:', e);
  process.exit(1);
});
