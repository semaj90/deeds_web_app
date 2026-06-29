#!/usr/bin/env node

/**
 * PHASE 85 P8 EXTENDED: SEMANTIC DIFF WITH LANGEXTRACT + GEMMA4
 *
 * Batch-wise semantic diff generation:
 * 1. Load feature labels in batches (Postgres)
 * 2. Extract linguistic features via LangExtract (language detection, entities)
 * 3. Compute semantic distance using Gemma4 (policy reasoning)
 * 4. Generate diff reports with confidence deltas
 * 5. Flag high-impact changes for ACP subagent review
 *
 * SAFETY: Archive deletion REQUIRES explicit --approve-archive-deletion flag
 *
 * Usage:
 *   node scripts/phase85/p8-semantic-diff-batch-langextract.mjs --dry-run
 *   node scripts/phase85/p8-semantic-diff-batch-langextract.mjs --batch=50 --langextract
 *   node scripts/phase85/p8-semantic-diff-batch-langextract.mjs --apply --verbose
 *
 * Agentic Integration:
 *   Submits high-impact diffs as ACP subagent jobs for resolution
 */

import crypto from 'crypto';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __root = path.resolve(__dirname, '../..');

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const apply = args.includes('--apply');
const useLangExtract = args.includes('--langextract') || process.env.LANGEXTRACT_ENABLED !== 'false';
const useLLM = args.includes('--llm') || process.env.LLAMA_SERVER_URL;
const approveArchiveDeletion = args.includes('--approve-archive-deletion');
const batchSize = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '50');
const maxBatches = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10');

// Configuration
const LANGEXTRACT_URL = process.env.LANGEXTRACT_URL || 'http://127.0.0.1:8095';
const GEMMA4_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
const TMP_DIR = path.resolve(__root, '.tmp');
const ARCHIVE_DIR = path.resolve(__root, 'deeds_labs/archived-p8-diffs');

// Initialize Postgres
const pool = new pg.Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5434,
  user: process.env.PGUSER || 'legal_admin',
  password: process.env.PGPASSWORD || '123456',
  database: process.env.PGDATABASE || 'legal_ai_db'
});

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

console.log(`\n📊 PHASE 85 P8: SEMANTIC DIFF WITH LANGEXTRACT + GEMMA4\n`);
console.log(`Mode: ${dryRun ? 'DRY-RUN' : apply ? 'APPLY' : 'VERIFY'}`);
console.log(`Batch size: ${batchSize}`);
console.log(`Max batches: ${maxBatches}`);
console.log(`LangExtract: ${useLangExtract ? 'enabled' : 'disabled'}`);
console.log(`Gemma4 LLM: ${useLLM ? 'enabled' : 'disabled'}`);
console.log(`Archive deletion approval: ${approveArchiveDeletion ? 'APPROVED' : 'REQUIRES --approve-archive-deletion'}\n`);

// ── Step 1: Fetch feature labels batch ──────────────────────────────────

async function fetchLabelsBatch(offset, limit) {
  const query = `
    SELECT
      packet_key,
      source_ref,
      feature_id,
      artifact_type,
      gan_validation_score as confidence,
      content_hash,
      created_at
    FROM atlas_artifacts
    WHERE artifact_type = 'feature_labels'
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `;

  try {
    const result = await pool.query(query, [limit, offset]);
    return result.rows;
  } catch (err) {
    console.error(`❌ Fetch error: ${err.message}`);
    return [];
  }
}

// ── Step 2: LangExtract enhancement ────────────────────────────────────

async function enhanceWithLangExtract(labels) {
  if (!useLangExtract || labels.length === 0) {
    return labels;
  }

  const enhanced = [];
  for (const label of labels) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${LANGEXTRACT_URL}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${label.source_ref} ${label.feature_id}`.substring(0, 1000),
          extract_entities: true,
          extract_patterns: true
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        enhanced.push({
          ...label,
          lang_features: data.features || null
        });
      } else {
        enhanced.push(label);
      }
    } catch (err) {
      enhanced.push(label);
    }
  }

  return enhanced;
}

// ── Step 3: Compute semantic distance ──────────────────────────────────

async function computeSemanticDistance(label1, label2) {
  if (!useLLM) {
    // Fallback: simple hash comparison
    const similarity = label1.content_hash === label2.content_hash ? 1.0 : 0.0;
    return {
      similarity,
      reasoning: 'hash-based (LLM disabled)'
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [
          {
            role: 'system',
            content: 'You are a legal feature comparison expert. Rate semantic similarity 0.0-1.0.'
          },
          {
            role: 'user',
            content: `Compare these feature labels for semantic similarity:\n1. ${label1.feature_id}\n2. ${label2.feature_id}\nReturn only a JSON with "similarity": <float> and "reasoning": "<str>"`
          }
        ],
        temperature: 0.1,
        max_tokens: 100,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      return {
        similarity: parsed.similarity || 0.5,
        reasoning: parsed.reasoning || 'LLM reasoning'
      };
    }
  } catch (err) {
    if (verbose) console.warn(`   ⚠️  LLM error: ${err.message}`);
  }

  return { similarity: 0.5, reasoning: 'fallback' };
}

// ── Step 4: Generate diff report ───────────────────────────────────────

async function generateDiffReport(batch, batchNum) {
  const report = {
    batch: batchNum,
    timestamp: new Date().toISOString(),
    total_items: batch.length,
    high_impact_diffs: [],
    medium_impact_diffs: [],
    low_impact_diffs: [],
    summary: {}
  };

  // Enhanced with LangExtract
  const enhanced = await enhanceWithLangExtract(batch);

  // Compare adjacent items for diff pattern
  for (let i = 0; i < enhanced.length - 1; i++) {
    const curr = enhanced[i];
    const next = enhanced[i + 1];

    const distance = await computeSemanticDistance(curr, next);
    const changeScore = 1.0 - distance.similarity;

    const diff = {
      item1: curr.packet_key,
      item2: next.packet_key,
      semantic_distance: changeScore.toFixed(3),
      confidence_delta: (Math.abs(curr.confidence - next.confidence)).toFixed(3),
      reasoning: distance.reasoning
    };

    if (changeScore > 0.5) {
      report.high_impact_diffs.push(diff);
    } else if (changeScore > 0.2) {
      report.medium_impact_diffs.push(diff);
    } else {
      report.low_impact_diffs.push(diff);
    }
  }

  report.summary = {
    high_impact: report.high_impact_diffs.length,
    medium_impact: report.medium_impact_diffs.length,
    low_impact: report.low_impact_diffs.length
  };

  return report;
}

// ── Step 5: Persist diff results ───────────────────────────────────────

async function persistDiffReport(report, batchNum) {
  const reportPath = path.resolve(TMP_DIR, `p8-diff-batch-${batchNum}.json`);

  if (!dryRun) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    if (verbose) console.log(`   ✅ Saved: ${reportPath}`);
  }

  return reportPath;
}

// ── Step 6: Submit high-impact diffs as ACP subagent jobs ───────────────

async function submitAcpSubagentJobs(report) {
  if (report.high_impact_diffs.length === 0) {
    if (verbose) console.log('   ℹ️  No high-impact diffs to submit');
    return { submitted: 0 };
  }

  const jobs = report.high_impact_diffs.map((diff, idx) => ({
    id: `acps-p8-${Date.now()}-${idx}`,
    type: 'semantic_diff_resolution',
    priority: 'high',
    diff,
    status: 'pending'
  }));

  if (dryRun) {
    if (verbose) {
      console.log(`   [DRY-RUN] Would submit ${jobs.length} ACP subagent jobs`);
      jobs.forEach(j => console.log(`            - ${j.id}`));
    }
    return { submitted: jobs.length, status: 'DRY-RUN' };
  }

  // Store job requests for ACP to pick up
  const jobPath = path.resolve(TMP_DIR, `acps-jobs-${Date.now()}.json`);
  fs.writeFileSync(jobPath, JSON.stringify(jobs, null, 2));
  if (verbose) console.log(`   ✅ Submitted ${jobs.length} ACP subagent jobs: ${jobPath}`);

  return { submitted: jobs.length, status: 'OK', jobsFile: jobPath };
}

// ── Step 7: Archive old diff reports (REQUIRES APPROVAL) ───────────────

async function archiveOldDiffReports() {
  if (!apply || !approveArchiveDeletion) {
    if (verbose) console.log('   ℹ️  Skipping archive (requires --approve-archive-deletion)');
    return { archived: 0, status: 'SKIPPED' };
  }

  const reports = fs.readdirSync(TMP_DIR)
    .filter(f => f.startsWith('p8-diff-batch-') && f.endsWith('.json'))
    .sort();

  if (reports.length === 0) {
    return { archived: 0, status: 'OK' };
  }

  // Create archive directory
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }

  // Move old reports to archive
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days old
  let archived = 0;

  for (const report of reports) {
    const fullPath = path.resolve(TMP_DIR, report);
    const stat = fs.statSync(fullPath);

    if (stat.mtime.getTime() < cutoff) {
      const destPath = path.resolve(ARCHIVE_DIR, report);
      fs.renameSync(fullPath, destPath);
      archived++;
    }
  }

  if (verbose) console.log(`   ✅ Archived ${archived} old diff reports`);
  return { archived, status: 'OK' };
}

// ── Main execution ────────────────────────────────────────────────────

async function main() {
  try {
    console.log('🔄 Processing batches...\n');

    let totalItems = 0;
    let totalHighImpact = 0;
    let totalSubmitted = 0;

    for (let batch = 0; batch < maxBatches; batch++) {
      const offset = batch * batchSize;
      const labels = await fetchLabelsBatch(offset, batchSize);

      if (labels.length === 0) {
        console.log(`   Batch ${batch + 1}: No more items\n`);
        break;
      }

      process.stdout.write(`   Batch ${batch + 1}: Processing ${labels.length} items... `);

      const report = await generateDiffReport(labels, batch + 1);
      await persistDiffReport(report, batch + 1);

      const acpResult = await submitAcpSubagentJobs(report);

      totalItems += labels.length;
      totalHighImpact += report.summary.high_impact;
      totalSubmitted += acpResult.submitted;

      console.log(`✓ (high: ${report.summary.high_impact}, medium: ${report.summary.medium_impact})`);

      // Small delay between batches
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n📊 P8 SEMANTIC DIFF SUMMARY:`);
    console.log(`   Total items analyzed: ${totalItems}`);
    console.log(`   High-impact diffs: ${totalHighImpact}`);
    console.log(`   ACP subagent jobs submitted: ${totalSubmitted}`);

    // Archive old reports if approved
    if (apply) {
      console.log(`\n♻️  Archiving old diffs...`);
      const archiveResult = await archiveOldDiffReports();
      console.log(`   Archived: ${archiveResult.archived}`);
      console.log(`   Status: ${archiveResult.status}`);

      if (!approveArchiveDeletion && archiveResult.status === 'SKIPPED') {
        console.log(`   ⚠️  To enable archive deletion, use: --approve-archive-deletion`);
      }
    }

    if (dryRun) {
      console.log(`\n🔄 DRY-RUN MODE: No diffs were stored or jobs submitted`);
      console.log('   Run with --apply to persist changes\n');
    } else {
      console.log(`\n✅ P8 SEMANTIC DIFF BATCH COMPLETE\n`);
    }

    await pool.end();
  } catch (err) {
    console.error('❌ Batch processing failed:', err.message);
    await pool.end();
    process.exit(1);
  }
}

main();