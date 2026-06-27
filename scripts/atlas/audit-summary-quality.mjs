#!/usr/bin/env node

/**
 * audit-summary-quality.mjs — P1-E Summary Enrichment Audit
 *
 * Audits all packets for summary quality (good/bad/missing/placeholder)
 * Detects thought leakage, placeholder content, and feature labeling gaps
 * Produces regeneration list for Gemma4 batch processing
 *
 * Usage:
 *   npx tsx scripts/atlas/audit-summary-quality.mjs --report
 *   npx tsx scripts/atlas/audit-summary-quality.mjs --dry-run
 *   npx tsx scripts/atlas/audit-summary-quality.mjs --report --limit 1000
 */

import { createPool } from 'pg';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// Import summary enrichment functions
const summaryEnrichmentPath = path.resolve(
  __dir,
  '../../sveltekit-frontend/src/lib/server/packet/summary-enrichment.ts'
);

// Inline implementations (since we can't directly import TS from Node)
function contentHash(text) {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(text || '').digest('hex').slice(0, 16);
}

function detectThoughtLeakage(summary) {
  if (!summary) return false;
  const leakagePatterns = [
    /\bi\s+(think|believe|want|need|should|suppose)/i,
    /\b(let\s+me|according\s+to\s+me|as\s+far\s+as\s+i|in\s+my\s+opinion)/i,
    /\b(todo|fixme|placeholder|xxx|hack|stub)\b/i,
  ];
  return leakagePatterns.some((pattern) => pattern.test(summary));
}

function detectPlaceholder(summary) {
  if (!summary) return true;
  if (summary.length < 20) return true;
  if (/^(.)\1{5,}$/.test(summary)) return true;
  const generic = ['function', 'class', 'type', 'interface', 'module', 'file', 'code'];
  const lowerSummary = summary.toLowerCase();
  if (generic.every((g) => !lowerSummary.includes(g))) {
    if (summary.split(' ').length < 5) return true;
  }
  return false;
}

function auditSummaryQuality(packetKey, summary) {
  const hash = contentHash(summary ?? '');

  if (!summary) {
    return {
      packetKey,
      summary,
      contentHash: hash,
      quality: 'missing',
      hasThoughtLeakage: false,
      isPlaceholder: true,
      reason: 'Summary is null/empty',
    };
  }

  const hasThoughtLeakage = detectThoughtLeakage(summary);
  if (hasThoughtLeakage) {
    return {
      packetKey,
      summary,
      contentHash: hash,
      quality: 'bad',
      hasThoughtLeakage: true,
      isPlaceholder: false,
      reason: 'Thought leakage detected (internal reasoning markers)',
    };
  }

  const isPlaceholder = detectPlaceholder(summary);
  if (isPlaceholder) {
    return {
      packetKey,
      summary,
      contentHash: hash,
      quality: 'placeholder',
      hasThoughtLeakage: false,
      isPlaceholder: true,
      reason: 'Placeholder or low-quality summary detected',
    };
  }

  return {
    packetKey,
    summary,
    contentHash: hash,
    quality: 'good',
    hasThoughtLeakage: false,
    isPlaceholder: false,
    reason: 'Summary passes quality checks',
  };
}

async function auditAllSummaries(db, limit) {
  const query = limit
    ? 'SELECT packet_key, summary FROM atlas_packets ORDER BY packet_key LIMIT $1'
    : 'SELECT packet_key, summary FROM atlas_packets ORDER BY packet_key';

  const params = limit ? [limit] : [];

  try {
    const result = await db.query(query, params);
    const audits = result.rows.map((row) =>
      auditSummaryQuality(row.packet_key, row.summary)
    );

    const good = audits.filter((a) => a.quality === 'good').length;
    const bad = audits.filter((a) => a.quality === 'bad').length;
    const missing = audits.filter((a) => a.quality === 'missing').length;
    const placeholder = audits.filter((a) => a.quality === 'placeholder').length;
    const needsRegen = bad + missing + placeholder;

    const thoughtLeaks = audits
      .filter((a) => a.hasThoughtLeakage)
      .slice(0, 10)
      .map((a) => ({
        packetKey: a.packetKey,
        summary: a.summary ?? '',
      }));

    return {
      totalPackets: result.rows.length,
      goodSummaries: good,
      badSummaries: bad,
      missingRequested: missing,
      placeholderDetected: placeholder,
      needsRegeneration: needsRegen,
      regenerationPercentage: Math.round((needsRegen / result.rows.length) * 100),
      topThoughtLeaks: thoughtLeaks,
      audits,
    };
  } catch (err) {
    console.error('[Summary Audit] Failed:', err);
    throw err;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isReport = args.includes('--report');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;

  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/legal_ai_db';

  let db;
  try {
    db = createPool({ connectionString: dbUrl });
    await db.connect();

    console.log('\n📊 Summary Quality Audit\n');

    const audit = await auditAllSummaries(db, limit);

    console.log(`Total packets audited: ${audit.totalPackets}`);
    console.log(`  ✅ Good summaries: ${audit.goodSummaries} (${Math.round((audit.goodSummaries / audit.totalPackets) * 100)}%)`);
    console.log(`  🔴 Bad (thought leakage): ${audit.badSummaries} (${Math.round((audit.badSummaries / audit.totalPackets) * 100)}%)`);
    console.log(`  ⚠️  Missing: ${audit.missingRequested} (${Math.round((audit.missingRequested / audit.totalPackets) * 100)}%)`);
    console.log(`  🟡 Placeholder: ${audit.placeholderDetected} (${Math.round((audit.placeholderDetected / audit.totalPackets) * 100)}%)`);
    console.log(`\nTotal needing regeneration: ${audit.needsRegeneration} (${audit.regenerationPercentage}%)`);

    if (audit.topThoughtLeaks.length > 0) {
      console.log('\nTop thought-leakage examples:');
      audit.topThoughtLeaks.slice(0, 5).forEach((leak, i) => {
        console.log(`  ${i + 1}. ${leak.packetKey}: "${leak.summary.substring(0, 80)}..."`);
      });
    }

    if (isReport || isDryRun) {
      // Write full audit to temp file
      const reportPath = '.tmp/summary-quality-audit.json';
      const fs = await import('fs');
      fs.writeFileSync(
        reportPath,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          stats: {
            totalPackets: audit.totalPackets,
            goodSummaries: audit.goodSummaries,
            badSummaries: audit.badSummaries,
            missingRequested: audit.missingRequested,
            placeholderDetected: audit.placeholderDetected,
            needsRegeneration: audit.needsRegeneration,
            regenerationPercentage: audit.regenerationPercentage,
          },
          regenerationList: audit.audits
            .filter((a) => a.quality !== 'good')
            .map((a) => ({
              packet_key: a.packetKey,
              quality: a.quality,
              reason: a.reason,
              summary: a.summary,
            })),
          topThoughtLeaks: audit.topThoughtLeaks,
        }, null, 2)
      );
      console.log(`\n📄 Full audit saved to: ${reportPath}`);
    }

    if (isDryRun) {
      console.log('\n✅ Dry run complete. No changes made.');
    }

    console.log('\n');
  } finally {
    if (db) await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
