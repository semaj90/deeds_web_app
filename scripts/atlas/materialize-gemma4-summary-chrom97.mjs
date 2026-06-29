#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeChrom97Packet } from '../../packages/parent-atlas/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const INPUT_NDJSON = path.join(ROOT, '.tmp', 'gemma4-summary-packets.ndjson');
const OUTPUT_NDJSON = path.join(ROOT, '.tmp', 'chrom97-summary-packets.ndjson');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'chrom97-summary-packets.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'chrom97-summary-packets.md');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LIMIT_ARG = argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = Number.parseInt(LIMIT_ARG ? LIMIT_ARG.split('=', 2)[1] : '0', 10);

function loadInput() {
  if (!fs.existsSync(INPUT_NDJSON)) {
    throw new Error(`Missing input NDJSON: ${INPUT_NDJSON}`);
  }
  const lines = fs.readFileSync(INPUT_NDJSON, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => JSON.parse(line));
}

async function main() {
  const rows = loadInput();
  const selected = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
  const packets = selected.map((row, index) => makeChrom97Packet(row, index));

  if (APPLY) {
    fs.mkdirSync(path.dirname(OUTPUT_NDJSON), { recursive: true });
    fs.writeFileSync(OUTPUT_NDJSON, packets.map((row) => stableStringify(row)).join('\n') + '\n', 'utf8');
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    input_ndjson: path.relative(ROOT, INPUT_NDJSON).replace(/\\/g, '/'),
    output_ndjson: path.relative(ROOT, OUTPUT_NDJSON).replace(/\\/g, '/'),
    input_rows: rows.length,
    selected_rows: selected.length,
    written_rows: APPLY ? packets.length : 0,
    packet_type: 'chrom97',
    sample: packets.slice(0, 5).map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      summary_length: String(row.summary ?? '').trim().length,
    })),
    note: 'chrom97 packets are derived from Gemma4 summary export and preserve canonical packet identity for downstream BitFrost, Qdrant, and multihop search lanes.',
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(
    REPORT_MD,
    [
      '# chrom97 Summary Packets',
      '',
      `Generated: ${report.generated_at}`,
      `Mode: ${report.mode}`,
      `Input: \`${report.input_ndjson}\``,
      `Output: \`${report.output_ndjson}\``,
      '',
      '## Sample',
      '',
      ...report.sample.map((row) => `- ${row.source_ref} | ${row.feature_id} | ${row.summary_length} chars`),
      '',
      report.note,
    ].join('\n'),
    'utf8',
  );

  console.log(`Wrote ${report.output_ndjson}`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_JSON).replace(/\\/g, '/')}`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_MD).replace(/\\/g, '/')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
