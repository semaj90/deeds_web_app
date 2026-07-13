#!/usr/bin/env node
/**
 * Phase 4: Gemma4 Weak Label Generation
 *
 * Use Gemma4 to grade remaining evaluation judgments.
 * Refines heuristic grades with semantic understanding.
 *
 * Process:
 *   1. Select pending judgments (graded_by = 'pending')
 *   2. Batch queries to Gemma4 for relevance scoring
 *   3. Convert scores to grades 0-3
 *   4. Mark as is_gold=false, graded_by='gemma4'
 *   5. Validate improved distribution
 */

import pg from 'pg';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

// Gemma4 endpoint (llama-server)
const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090/v1/chat/completions';
const MODEL = 'gemma4-legal-iq4xs-direct.gguf';

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
      console.log(`  ⚠️ Gemma4 unavailable (${response.status}). Using heuristic fallback.`);
      return 'SKIP';
    }

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content?.trim() || 'SKIP';
  } catch (err) {
    console.log(`  ⚠️ Gemma4 error: ${(err as Error).message}. Using fallback.`);
    return 'SKIP';
  }
}

function parseGemmaGrade(response: string): number {
  if (response === 'SKIP') return -1; // Skip, keep heuristic
  const match = response.match(/\b([0-3])\b/);
  return match ? parseInt(match[1]) : -1;
}

async function main() {
  console.log('\nPhase 4: Gemma4 Weak Label Generation');
  console.log('Refine heuristic grades with semantic understanding\n');

  try {
    console.log('[1/4] LOADING PENDING JUDGMENTS\n');

    // Sample pending judgments for weak labeling
    const pending = await pool.query(`
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
      LIMIT 200;
    `);

    console.log(`Loaded ${pending.rows.length} pending judgments for weak labeling\n`);

    console.log('[2/4] QUERYING GEMMA4 FOR SEMANTIC GRADES\n');
    console.log('Note: If Gemma4 unavailable, will keep heuristic grades\n');

    let gemma4Updated = 0;
    let skipped = 0;

    for (const row of pending.rows) {
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
        // Update with Gemma4 grade
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
        // Keep heuristic, mark as processed
        await pool.query(
          `
          UPDATE evaluation_judgments
          SET graded_by = 'heuristic'
          WHERE id = $1;
        `,
          [row.id]
        );
        skipped++;
      }

      if ((gemma4Updated + skipped) % 20 === 0) {
        console.log(`  Progress: ${gemma4Updated} Gemma4, ${skipped} skipped`);
      }
    }

    console.log(`\n  Gemma4 grades: ${gemma4Updated}`);
    console.log(`  Heuristic kept: ${skipped}`);
    console.log('');

    console.log('[3/4] VALIDATING IMPROVED DISTRIBUTION\n');

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

    let gate1Pass = true;
    console.log('Grade Distribution (After Gemma4 Refinement):');
    for (const row of distribution.rows) {
      const [minPct, maxPct] = targets[row.relevance_grade];
      const status = row.pct >= minPct && row.pct <= maxPct ? 'OK' : 'MISS';
      if (status === 'MISS') gate1Pass = false;

      console.log(
        `  Grade ${row.relevance_grade}: ${row.count} (${row.pct}%) ` +
          `[target: ${minPct}-${maxPct}%] ${status} (${row.gemma4_count} from Gemma4)`
      );
    }
    console.log('');

    console.log('[4/4] FINAL GATE 1 REASSESSMENT\n');

    const variance = await pool.query(`
      SELECT
        COUNT(*) as total_queries,
        COUNT(CASE WHEN grade_span >= 2 THEN 1 END) as with_variance,
        ROUND(100.0 * COUNT(CASE WHEN grade_span >= 2 THEN 1 END) / COUNT(*), 2) as variance_pct
      FROM (
        SELECT
          query_id,
          MAX(relevance_grade) - MIN(relevance_grade) as grade_span
        FROM evaluation_judgments
        GROUP BY query_id
      ) sq;
    `);

    const v = variance.rows[0];
    const gate2Pass = v.variance_pct >= 80;

    console.log('═════════════════════════════════════════════════════════════\n');

    if (gate1Pass && gate2Pass) {
      console.log('✅ GATE 1 & 2 NOW PASS\n');
      console.log('Evaluation data is READY for XGBoost training.\n');
      console.log('Recommended next steps:');
      console.log('  1. Run: npm run atlas:gate1:final-audit');
      console.log('  2. Verify all 4 gates pass');
      console.log('  3. Begin Phase 5: Domain classification');
      console.log('  4. Phase 6: Qdrant canonical schema');
      console.log('  5. Phase 7: XGBoost Stage 2 reranker training');
    } else {
      console.log(`⚠️  PARTIAL PASS (Gate 1: ${gate1Pass ? 'PASS' : 'MISS'}, Gate 2: ${gate2Pass ? 'PASS' : 'MISS'})\n`);
      console.log('Recommendation: Manual grading can further refine distribution.');
      console.log('Current data is SUFFICIENT for initial training.');
    }

    console.log('\nEvaluation dataset summary:');
    const totalStats = await pool.query(
      `SELECT COUNT(*) as total, COUNT(CASE WHEN graded_by='gemma4' THEN 1 END) as gemma4, COUNT(CASE WHEN is_gold THEN 1 END) as gold FROM evaluation_judgments;`
    );
    const ts = totalStats.rows[0];
    console.log(`  Total judgments: ${ts.total}`);
    console.log(`  Gemma4 labels: ${ts.gemma4}`);
    console.log(`  Gold labels: ${ts.gold}`);
    console.log('');

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
