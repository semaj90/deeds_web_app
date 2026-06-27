/**
 * GAN Validate Live Packets
 * Read actual indexed packets from Postgres and validate with GAN adversarial probes
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface Packet {
  packet_key: string;
  feature_id: string;
  source_ref: string;
  som_row?: number;
  som_col?: number;
  summary?: string;
  identity_confidence?: number;
}

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║ GAN Validate Live Packets — Real Data Validation      ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

try {
  // Query real packets from Postgres
  console.log('Step 1: Reading 10 sample packets from Postgres...');

  const query = `
    SELECT
      packet_key,
      feature_id,
      source_ref,
      som_row,
      som_col,
      summary,
      identity_confidence
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
      AND feature_id IS NOT NULL
      AND source_ref IS NOT NULL
    LIMIT 10
  `;

  const command = `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -A -F'|' -c "${query}"`;
  const { stdout } = await execAsync(command);

  const lines = stdout.trim().split('\n').filter(l => l.length > 0);
  const packets: Packet[] = lines.map(line => {
    const [packet_key, feature_id, source_ref, som_row, som_col, summary, identity_confidence] = line.split('|');
    return {
      packet_key: packet_key.trim(),
      feature_id: feature_id.trim(),
      source_ref: source_ref.trim(),
      som_row: som_row ? parseInt(som_row.trim()) : undefined,
      som_col: som_col ? parseInt(som_col.trim()) : undefined,
      summary: summary?.trim(),
      identity_confidence: identity_confidence ? parseFloat(identity_confidence.trim()) : undefined,
    };
  });

  console.log(`✅ Retrieved ${packets.length} packets\n`);

  // Validate each packet with GAN probes
  console.log('Step 2: Validating packets with GAN adversarial probes...\n');

  let validCount = 0;
  let hardFailures = 0;
  let softWarnings = 0;

  const validationResults = packets.map((packet, idx) => {
    console.log(`Packet ${idx + 1}:`);
    console.log(`  packet_key: ${packet.packet_key}`);
    console.log(`  feature_id: ${packet.feature_id}`);
    console.log(`  source_ref: ${packet.source_ref}`);
    console.log(`  som_cell: [${packet.som_row}, ${packet.som_col}]`);
    console.log(`  identity_confidence: ${packet.identity_confidence ?? 'N/A'}`);

    // ADV001: Check packet_key
    const packetKeyValid = packet.packet_key && packet.packet_key.length > 0;
    if (!packetKeyValid) {
      console.log(`  ❌ ADV001: MISSING_PACKET_KEY`);
      hardFailures++;
    }

    // ADV002: Check source_ref format (should be file path)
    const sourceRefValid = /^[a-z0-9\/_\-\.]+\.(ts|tsx|js|jsx|py|go|rs|java)$/.test(packet.source_ref);
    if (!sourceRefValid && !packet.source_ref.includes('#')) {
      console.log(`  ⚠️  ADV002: INVALID_SOURCE_REF (format: "${packet.source_ref}")`);
      softWarnings++;
    }

    // ADV004: Check for placeholder terms in summary
    const placeholderPattern = /fake_|^\?\?|TODO|TBD|FIXME/i;
    const hasPlaceholder = packet.summary && placeholderPattern.test(packet.summary);
    if (hasPlaceholder) {
      console.log(`  ❌ ADV004: BLOCKED_TERM (placeholder detected in summary)`);
      hardFailures++;
    }

    // Check for soft warnings
    const missingSummary = !packet.summary;
    const lowConfidence = packet.identity_confidence && packet.identity_confidence < 0.7;

    if (missingSummary) {
      console.log(`  ⚠️  SOFT: missing_summary`);
      softWarnings++;
    }
    if (lowConfidence) {
      console.log(`  ⚠️  SOFT: low_identity_confidence (${packet.identity_confidence})`);
      softWarnings++;
    }

    if (!hasPlaceholder && packetKeyValid && missingSummary === false && lowConfidence === false) {
      console.log(`  ✅ PASS`);
      validCount++;
    }

    console.log();

    return {
      packet_key: packet.packet_key,
      source_ref: packet.source_ref,
      feature_id: packet.feature_id,
      valid: packetKeyValid && !hasPlaceholder,
      hardFailures: hasPlaceholder ? 1 : 0,
      softWarnings: (missingSummary ? 1 : 0) + (lowConfidence ? 1 : 0),
    };
  });

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('GAN Validation Summary:');
  console.log(`  Total packets: ${packets.length}`);
  console.log(`  Valid: ${validCount}`);
  console.log(`  Hard failures detected: ${hardFailures}`);
  console.log(`  Soft warnings: ${softWarnings}`);
  console.log(`  Pass rate: ${((validCount / packets.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Write detailed report
  const fs = await import('node:fs/promises');
  await fs.mkdir('.tmp', { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    source: 'atlas_packets (Postgres)',
    total_packets: packets.length,
    valid: validCount,
    hard_failures: hardFailures,
    soft_warnings: softWarnings,
    pass_rate: `${((validCount / packets.length) * 100).toFixed(1)}%`,
    validation_results: validationResults,
    adversarial_probes_active: ['ADV001', 'ADV002', 'ADV004'],
    notes: [
      'ADV001: packet_key must be non-empty',
      'ADV002: source_ref should match file path pattern',
      'ADV004: summary must not contain placeholder terms (fake_, ??, TODO, TBD, FIXME)',
      'Soft warnings: missing_summary, low_identity_confidence',
    ],
  };

  await fs.writeFile('.tmp/gan-validate-live-packets-report.json', JSON.stringify(report, null, 2));
  console.log(`✓ Report written: .tmp/gan-validate-live-packets-report.json\n`);

  // Success if all hard validations pass
  const success = hardFailures === 0;
  console.log(`╔════════════════════════════════════════════════════════╗`);
  console.log(`║ ${success ? '✅ GAN VALIDATION PASS' : '❌ GAN VALIDATION FAIL'} — Live packet audit complete   ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);

  process.exit(success ? 0 : 1);
} catch (err) {
  console.error('❌ Error reading packets from Postgres:');
  console.error((err as Error).message);
  process.exit(1);
}
