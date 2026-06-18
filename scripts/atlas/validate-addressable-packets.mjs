#!/usr/bin/env node
/**
 * scripts/atlas/validate-addressable-packets.mjs
 *
 * NDJSON validator for addressable packets.
 * Reads `.tmp/addressable-packets.ndjson` and validates each row against AddressablePacketSchema.
 * Writes a report to `docs/reports/addressable-packets-validation.json`.
 * If `--apply` is passed, writes corrected/defaulted packets to `.tmp/addressable-packets.validated.ndjson`.
 *
 * Usage:
 *   npx tsx scripts/atlas/validate-addressable-packets.mjs [--verbose] [--json] [--apply]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AddressablePacketSchema, defaultPermissions } from '../../sveltekit-frontend/src/lib/server/packets/packet-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const INPUT_NDJSON = path.join(REPO_ROOT, '.tmp', 'addressable-packets.ndjson');
const OUTPUT_VALIDATED_NDJSON = path.join(REPO_ROOT, '.tmp', 'addressable-packets.validated.ndjson');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'addressable-packets-validation.json');

const VERBOSE = process.argv.includes('--verbose');
const JSON_OUT = process.argv.includes('--json');
const APPLY = process.argv.includes('--apply');

async function main() {
  if (!fs.existsSync(INPUT_NDJSON)) {
    console.error(`Input file not found: ${INPUT_NDJSON}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(INPUT_NDJSON, 'utf8');
  const lines = fileContent.split('\n').filter(line => line.trim().length > 0);

  let totalChecked = 0;
  let totalValid = 0;
  let totalInvalid = 0;
  const invalidSamples = [];
  const validatedPackets = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    let parsed;
    try {
      parsed = JSON.parse(rawLine);
    } catch (err) {
      totalInvalid++;
      invalidSamples.push({
        line: i + 1,
        error: 'JSON_PARSE_ERROR',
        message: err.message,
      });
      continue;
    }

    totalChecked++;

    // Apply defaults / normalize before Zod parsing if --apply is set
    if (APPLY) {
      if (!parsed.permissions || typeof parsed.permissions !== 'object' || Object.keys(parsed.permissions).length === 0) {
        parsed.permissions = defaultPermissions(parsed.source_table === 'nes_chrom_packets' ? 'runtime_capture' : 'repo_index');
      }
      if (!parsed.metadata || typeof parsed.metadata !== 'object') {
        parsed.metadata = {
          repo_root: 'deeds-web-app',
          app_root: 'sveltekit-frontend',
          file_path: parsed.file_path || '',
          directory_path: parsed.directory_path || '',
        };
      }
      if (!parsed.topology || typeof parsed.topology !== 'object') {
        parsed.topology = {};
      }
      if (!parsed.vectors || typeof parsed.vectors !== 'object') {
        parsed.vectors = {};
      }
      if (!parsed.enrichment || typeof parsed.enrichment !== 'object') {
        parsed.enrichment = {};
      }
    }

    // safe parse
    const result = AddressablePacketSchema.safeParse(parsed);
    if (result.success) {
      totalValid++;
      validatedPackets.push({
        ...parsed,
        ...result.data,
      });
    } else {
      totalInvalid++;
      if (invalidSamples.length < 100 || VERBOSE) {
        invalidSamples.push({
          line: i + 1,
          packet_key: parsed.packet_key || 'UNKNOWN',
          errors: (result.error?.issues || result.error?.errors || []).map(e => `${e.path.join('.')}: ${e.message}`),
        });
      }
    }
  }

  const pass = totalInvalid === 0;

  const report = {
    generated_at: new Date().toISOString(),
    total_checked: totalChecked,
    total_valid: totalValid,
    total_invalid: totalInvalid,
    validation_pass: pass,
    applied_fixes: APPLY,
    invalid_samples: invalidSamples,
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');

  if (APPLY) {
    fs.mkdirSync(path.dirname(OUTPUT_VALIDATED_NDJSON), { recursive: true });
    const outputContent = validatedPackets.map(p => JSON.stringify(p)).join('\n') + (validatedPackets.length > 0 ? '\n' : '');
    fs.writeFileSync(OUTPUT_VALIDATED_NDJSON, outputContent, 'utf8');
  }

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ pass, totalChecked, totalValid, totalInvalid }) + '\n');
  } else {
    console.log(`\n═══ Addressable Packets Validation ══════════════════════════`);
    console.log(`Total checked:  ${totalChecked}`);
    console.log(`Total valid:    ${totalValid}`);
    console.log(`Total invalid:  ${totalInvalid}`);
    console.log(`Pass status:    ${pass ? '✅ PASS' : '❌ FAIL'}`);
    if (APPLY) {
      console.log(`Wrote validated packets to: .tmp/addressable-packets.validated.ndjson`);
    }
    console.log(`Report written to: docs/reports/addressable-packets-validation.json`);
    if (invalidSamples.length > 0) {
      console.log('\nSamples of invalid packets:');
      invalidSamples.slice(0, 10).forEach(sample => {
        console.log(`  Line ${sample.line} (${sample.packet_key}):`);
        sample.errors.forEach(err => console.log(`    - ${err}`));
      });
    }
  }

  process.exitCode = pass ? 0 : 1;
}

main().catch(err => {
  console.error('Validation script crash:', err);
  process.exit(1);
});
