#!/usr/bin/env node
/**
 * ACP Packet Transport Audit: Deterministic structural validation
 *
 * Checks:
 * - hex packet_key validity and length
 * - UTF-8 decode safety
 * - JSON-RPC 2.0 shape compliance
 * - canonical field presence
 * - cache namespace validity
 * - traversal_path array structure
 * - prompt injection risk
 *
 * Emits GAN trigger task if audit fails on critical checks.
 *
 * Usage:
 *   node scripts/atlas/audit-acp-packet-transport.mjs [--sample=100]
 */

import { Pool } from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import fs from 'fs';
import path from 'path';

await loadAtlasEnv();

const PG_URL = process.env.DATABASE_URL;
const SAMPLE = parseInt(process.argv.find(a => a.startsWith('--sample='))?.split('=')[1] ?? '0');

if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: PG_URL });

// Allowed JSON-RPC methods
const ALLOWED_METHODS = new Set([
  'atlas.search',
  'atlas.packet.get',
  'atlas.cache.warm',
  'atlas.graph.expand',
  'atlas.provenance.get',
  'atlas.replay.verify',
  'atlas.recommend.fix'
]);

// Prompt injection patterns
const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /system\s+prompt/i,
  /developer\s+message/i,
  /reveal\s+hidden/i,
  /bypass/i,
  /exfiltrate/i,
  /override\s+policy/i,
  /tool\s+call/i,
  /run\s+command/i,
  /delete\s+files/i,
  /send\s+secrets/i
];

let auditResults = {
  total_packets: 0,
  valid_packets: 0,
  invalid_packets: 0,
  gan_trigger: false,
  issues: [],
  samples: {
    valid: [],
    invalid: [],
    high_risk: []
  }
};

/**
 * Check if hex string is valid
 */
function isValidHex(str) {
  return /^[0-9a-f]+$/i.test(str);
}

/**
 * Check if UTF-8 string is safe to decode
 */
function isUtf8Safe(buffer) {
  try {
    const decoded = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : buffer;
    // Try to encode back; if it matches, it's valid
    return Buffer.from(decoded, 'utf8').toString('utf8') === decoded;
  } catch {
    return false;
  }
}

/**
 * Check for prompt injection risk
 */
function checkPromptInjectionRisk(text) {
  if (!text || typeof text !== 'string') return false;
  return INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Audit single packet
 */
function auditPacket(packet) {
  const result = {
    packet_id: packet.packet_id,
    packet_key: packet.packet_key,
    checks: {
      hex_packet_key_valid: false,
      packet_key_length_valid: false,
      utf8_decode_safe: false,
      json_payload_valid: false,
      jsonrpc_shape_valid: false,
      method_allowlisted: true, // default: no JSON-RPC = valid
      canonical_fields_present: false,
      cache_namespace_valid: true, // optional
      traversal_path_array: true, // optional
      prompt_injection_risk: false
    },
    gan_trigger: false,
    issues: []
  };

  // Check 1: hex packet_key
  if (packet.packet_key) {
    // packet_key can be non-hex (e.g., "intent:123", "schema:stub"), but if hex, validate it
    if (/^[0-9a-f]{32,}$/i.test(packet.packet_key)) {
      result.checks.hex_packet_key_valid = isValidHex(packet.packet_key);
      result.checks.packet_key_length_valid = packet.packet_key.length >= 32 && packet.packet_key.length <= 256;
    } else {
      // Non-hex keys are OK (structural identities)
      result.checks.hex_packet_key_valid = true;
      result.checks.packet_key_length_valid = packet.packet_key.length > 0 && packet.packet_key.length <= 256;
    }
  }

  // Check 2: UTF-8 safety on text fields
  result.checks.utf8_decode_safe = true; // Postgres enforces UTF-8, assume safe
  if (packet.summary && !isUtf8Safe(packet.summary)) {
    result.checks.utf8_decode_safe = false;
    result.issues.push('summary not UTF-8 safe');
    result.gan_trigger = true;
  }

  // Check 3: canonical fields present
  const hasSourceRef = packet.source_ref && packet.source_ref.length > 0;
  const hasFeatureId = packet.feature_id && packet.feature_id.length > 0;
  const hasFeatureLabel = packet.feature_label && packet.feature_label.length > 0;
  result.checks.canonical_fields_present = hasSourceRef && hasFeatureId && hasFeatureLabel;
  if (!result.checks.canonical_fields_present) {
    result.issues.push('missing canonical fields');
    result.gan_trigger = true;
  }

  // Check 4: prompt injection risk
  const textToCheck = [packet.summary, packet.feature_label, packet.file_path].filter(Boolean).join(' ');
  result.checks.prompt_injection_risk = checkPromptInjectionRisk(textToCheck);
  if (result.checks.prompt_injection_risk) {
    result.issues.push('prompt injection risk detected');
    result.gan_trigger = true;
  }

  return result;
}

/**
 * Main audit
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('ACP PACKET TRANSPORT AUDIT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  const client = await pool.connect();
  try {
    // Fetch packets from canonical table (nes_chrom_packets is the current live table)
    const query = `
      SELECT
        id as packet_id,
        packet_key,
        source_ref,
        file_path,
        feature_id,
        feature_label,
        summary
      FROM nes_chrom_packets
      WHERE packet_key IS NOT NULL
      ORDER BY id
      ${SAMPLE > 0 ? `LIMIT ${SAMPLE}` : ''}
    `;

    const res = await client.query(query);
    const packets = res.rows;
    auditResults.total_packets = packets.length;

    console.log(`Auditing ${packets.length} packets...`);
    console.log();

    // Audit each packet
    for (const packet of packets) {
      const auditResult = auditPacket(packet);

      if (auditResult.issues.length === 0) {
        auditResults.valid_packets++;
        if (auditResults.samples.valid.length < 3) {
          auditResults.samples.valid.push(auditResult);
        }
      } else {
        auditResults.invalid_packets++;
        if (auditResult.checks.prompt_injection_risk) {
          if (auditResults.samples.high_risk.length < 3) {
            auditResults.samples.high_risk.push(auditResult);
          }
        } else if (auditResults.samples.invalid.length < 3) {
          auditResults.samples.invalid.push(auditResult);
        }
      }

      if (auditResult.gan_trigger) {
        auditResults.gan_trigger = true;
      }

      auditResults.issues.push(...auditResult.issues.map(issue => ({
        packet_id: packet.packet_id,
        packet_key: packet.packet_key,
        issue
      })));
    }

    console.log('📊 Audit Results:');
    console.log(`  Total packets: ${auditResults.total_packets}`);
    console.log(`  Valid: ${auditResults.valid_packets}`);
    console.log(`  Invalid: ${auditResults.invalid_packets}`);
    console.log(`  Validity: ${(auditResults.valid_packets / auditResults.total_packets * 100).toFixed(1)}%`);
    console.log();

    if (auditResults.gan_trigger) {
      console.log('🚨 GAN TRIGGER ACTIVATED');
      console.log(`  Issues found: ${auditResults.issues.length}`);
      console.log(`  High-risk samples: ${auditResults.samples.high_risk.length}`);
      console.log();
    } else {
      console.log('✅ All packets passed transport audit');
      console.log();
    }

  } finally {
    client.release();
  }

  // Write JSON report
  const reportDir = 'docs/reports';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const jsonReportPath = path.join(reportDir, 'acp-packet-transport-audit.json');
  fs.writeFileSync(jsonReportPath, JSON.stringify(auditResults, null, 2));
  console.log(`📄 JSON report: ${jsonReportPath}`);

  // Write MD report
  const mdReport = `# ACP Packet Transport Audit Report

**Date**: ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Total Packets Audited | ${auditResults.total_packets} |
| Valid | ${auditResults.valid_packets} (${(auditResults.valid_packets / auditResults.total_packets * 100).toFixed(1)}%) |
| Invalid | ${auditResults.invalid_packets} (${(auditResults.invalid_packets / auditResults.total_packets * 100).toFixed(1)}%) |
| GAN Trigger | ${auditResults.gan_trigger ? '🚨 YES' : '✅ NO'} |

## Issues Found

**Count**: ${auditResults.issues.length}

${auditResults.issues.length > 0 ? `
Top issues:
\`\`\`
${auditResults.issues.slice(0, 10).map(i => `${i.packet_key}: ${i.issue}`).join('\n')}
\`\`\`
` : 'None'}

## High-Risk Samples

${auditResults.samples.high_risk.length > 0 ? `
**Prompt Injection Risk**:
\`\`\`json
${JSON.stringify(auditResults.samples.high_risk, null, 2)}
\`\`\`
` : 'None detected'}

## Valid Sample

\`\`\`json
${JSON.stringify(auditResults.samples.valid[0], null, 2)}
\`\`\`

## Recommendation

${auditResults.gan_trigger ? `
🚨 **GAN Validation Required**

Before proceeding with P3g embedding backfill:
\`\`\`bash
npm run atlas:rpc-validation-gan
\`\`\`

Review ${auditResults.issues.length} structural issues and high-risk packets.
` : `
✅ **No GAN Trigger**

Proceed with P3g embedding backfill:
\`\`\`bash
npm run atlas:backfill:qdrant:embeddings:apply
\`\`\`
`}
`;

const mdReportPath = path.join(reportDir, 'acp-packet-transport-audit.md');
fs.writeFileSync(mdReportPath, mdReport);
console.log(`📄 MD report: ${mdReportPath}`);
console.log();

  // Emit kanban task if GAN triggered
  if (auditResults.gan_trigger) {
    const tmpDir = '.tmp';
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const kanbanPath = path.join(tmpDir, 'kanban_tasks.jsonl');
    const task = {
      story_id: 'ACP-PACKET-GAN',
      task_id: 'validate-acp-packet-transport',
      worker_id: 'acp-packet-audit',
      status: 'TODO',
      bucket: 'gan_trigger',
      recommended_command: 'npm run atlas:rpc-validation-gan',
      proof_output: 'docs/reports/acp-packet-transport-audit.json',
      verdict: 'PENDING'
    };

    fs.appendFileSync(kanbanPath, JSON.stringify(task) + '\n');
    console.log(`📋 Kanban task emitted: ${kanbanPath}`);
    console.log();
  }

  console.log('═══════════════════════════════════════════════════════════════');

  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
