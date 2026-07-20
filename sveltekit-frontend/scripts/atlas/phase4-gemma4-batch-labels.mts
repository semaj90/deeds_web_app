#!/usr/bin/env node
/**
 * Phase 4: Batch Gemma4 Weak Label Generation
 *
 * Process ALL pending judgments in batches of 500 until complete.
 * Estimates: 17K pending judgments ÷ 500/batch = ~34 batches ≈ 8-10 hours
 */

import pg from 'pg';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090/v1/chat/completions';
const MODEL = 'gemma4-legal-iq4xs-direct.gguf';
const BATCH_SIZE = 500;
const MAX_BATCHES = parseInt(process.env.MAX_BATCHES || '100');

async function callGemma4(prompt: string): Promise<string> {
  try {
    const response = await fetch(GEMMA4_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 10,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return 'SKIP';
    }

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content?.trim() || 'SKIP';
  } catch (err) {
    return 'SKIP';
  }
}

function parseGemmaGrade(response: string): number {
  if (response === 'SKIP') return -1;
  const match = response.match(/\b([0-3])\b/);
  return match ? parseInt(match[1]) : -1;
}

async function processBatch(batchNum: number): Promise<{ updated: number; skipped: number }> {
  console.log(`\n[Batch ${batchNum}] Loading ${BATCH_SIZE} pending judgments...`);

  const pending = await pool.query(
    `
    SELECT
      ej.id,
      ej.query_id,
      ej.packet_key,
      ej.relevance_grade as heuristic_grade,
      esq.query_text,
      ap.summary as packet_summary,
      ap.source_ref
    FROM evaluation_judgments ej
    JOIN evaluation_seed_queries esq ON ej.query_id = esq.query_id
    JOIN atlas_packets ap ON ej.packet_key = ap.packet_key
    WHERE ej.graded_by = 'pending'
    ORDER BY RANDOM()
    LIMIT $1;
  `,
    [BATCH_SIZE]
  );

  if (pending.rows.length === 0) {
    console.log('✅ No more pending judgments — all processed!');
    return { updated: 0, skipped: 0 };
  }

  console.log(`Processing ${pending.rows.length} items...`);

  let gemma4Updated = 0;
  let skipped = 0;

  for (let i = 0; i < pending.rows.length; i++) {
    const row = pending.rows[i];
    const prompt = `
Rate the relevance of this code to the query.

Query: ${row.query_text}

Code: ${row.source_ref}
Summary: ${row.packet_summary || '(no summary)'}

Grade only as: 0 (irrelevant), 1 (weak), 2 (good), or 3 (best).
Reply with ONLY the number.
    `.trim();

    const response = await callGemma4(prompt);
    const grade = parseGemmaGrade(response);

    if (grade >= 0) {
      await pool.query(
        `
        UPDATE evaluation_judgments
        SET relevance_grade = $1, graded_by = 'gemma4', confidence = 0.65
        WHERE id = $2;
      `,
        [grade, row.id]
      );
      gemma4Updated++;
    } else {
      // Keep as pending if parse fails (don't change graded_by)
      skipped++;
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${pending.rows.length} processed (${gemma4Updated} Gemma4, ${skipped} skipped)`);
    }
  }

  console.log(`Batch complete: ${gemma4Updated} Gemma4, ${skipped} skipped`);
  return { updated: gemma4Updated, skipped };
}

async function showDistribution(): Promise<void> {
  const distribution = await pool.query(`
    SELECT
      relevance_grade,
      COUNT(*) as count,
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct,
      COUNT(CASE WHEN graded_by = 'gemma4' THEN 1 END) as gemma4_count
    FROM evaluation_judgments
    GROUP BY relevance_grade
    ORDER BY relevance_grade;
  `);

  const targets: Record<number, [number, number]> = {
    0: [30, 36],
    1: [28, 34],
    2: [20, 25],
    3: [10, 15],
  };

  console.log('\n📊 Current Distribution:');
  let allPass = true;
  for (const row of distribution.rows) {
    const [minPct, maxPct] = targets[row.relevance_grade];
    const status = row.pct >= minPct && row.pct <= maxPct ? '✅' : '⚠️';
    if (status === '⚠️') allPass = false;

    console.log(
      `  Grade ${row.relevance_grade}: ${row.count.toString().padEnd(6)} (${row.pct.toString().padEnd(5)}%) ` +
        `[target: ${minPct}-${maxPct}%] ${status} (${row.gemma4_count} Gemma4)`
    );
  }

  const pending = await pool.query(
    `SELECT COUNT(*) as count FROM evaluation_judgments WHERE graded_by = 'pending';`
  );
  console.log(`\n⏳ Remaining pending: ${pending.rows[0].count}`);
  console.log(allPass ? '✅ GATE 1 PASS!' : '⚠️ Distribution target not met yet');
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  PHASE 4: BATCH GEMMA4 WEAK LABEL GENERATION                ║');
  console.log('║  Processing pending judgments in batches                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (let batch = 1; batch <= MAX_BATCHES; batch++) {
    const { updated, skipped } = await processBatch(batch);

    if (updated === 0 && skipped === 0) {
      console.log('\n✅ All pending judgments processed!');
      break;
    }

    totalUpdated += updated;
    totalSkipped += skipped;

    // Show progress every 5 batches
    if (batch % 5 === 0 || batch === 1) {
      await showDistribution();
    }

    // Delay between batches to avoid overwhelming Gemma4
    if (batch < MAX_BATCHES) {
      console.log(`\nWaiting 2s before batch ${batch + 1}...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  SUMMARY                                                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`\nTotal Gemma4 labels: ${totalUpdated}`);
  console.log(`Total skipped: ${totalSkipped}`);

  await showDistribution();

  console.log('\n📝 Next Steps:');
  console.log('  1. Review distribution above');
  console.log('  2. If GATE 1 PASS: run XGBoost Phase 7 training');
  console.log('  3. If still MISS: adjust manual grading strategy or rerun');

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
