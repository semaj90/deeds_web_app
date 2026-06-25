#!/usr/bin/env node
/**
 * P1.2: Error Plan Script
 * Generates remediation plan based on P1.1 audit findings
 */
import pg from 'pg';

function log(msg, level = 'info') {
  const ts = new Date().toISOString();
  const prefix = { info: '✓', warn: '⚠', error: '✗', plan: '📋' }[level] || '•';
  console.log(`[${ts}] ${prefix} ${msg}`);
}

async function main() {
  log('═══════════════════════════════════════════════════════════════', 'plan');
  log('       P1.2: ERROR PLAN', 'plan');
  log('═══════════════════════════════════════════════════════════════\n', 'plan');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    log('DATABASE_URL env var not set', 'error');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  try {
    const tableCheck = await pool.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables 
       WHERE table_name = 'error_logs' AND table_schema = 'public')
    `);

    if (!tableCheck.rows[0].exists) {
      log('error_logs table does not exist', 'error');
      process.exit(1);
    }

    // Get error distribution
    const byCategory = await pool.query(`
      SELECT error_category, COUNT(*) as count, 
             array_agg(DISTINCT severity) as severities,
             array_agg(DISTINCT message) as sample_messages
      FROM error_logs
      GROUP BY error_category
      ORDER BY count DESC
    `);

    const plans = [];
    for (const row of byCategory.rows) {
      const isCritical = row.severities.includes('CRITICAL');
      const isHigh = row.severities.includes('ERROR');
      let priority = 'medium';
      if (isCritical) priority = 'critical';
      else if (isHigh) priority = 'high';

      const fixer = classifyFixer(row.error_category);
      const effort = estimateEffort(row.error_category);
      const confidence = estimateConfidence(row.error_category);

      plans.push({
        category: row.error_category,
        count: row.count,
        severities: row.severities,
        priority,
        fixer_type: fixer,
        effort_minutes: effort,
        confidence: confidence,
        sample_message: row.sample_messages[0],
        impact_score: (row.count * (isCritical ? 3 : isHigh ? 2 : 1)) / effort
      });
    }

    // Sort by impact score
    plans.sort((a, b) => b.impact_score - a.impact_score);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    FIX PLAN SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('Recommended fixes (sorted by impact/effort ratio):\n');
    
    plans.forEach((plan, i) => {
      console.log(`${i + 1}. ${plan.category.toUpperCase()}`);
      console.log(`   Count: ${plan.count} | Severities: ${plan.severities.join(', ')}`);
      console.log(`   Priority: ${plan.priority.toUpperCase()}`);
      console.log(`   Fixer: ${plan.fixer_type}`);
      console.log(`   Effort: ${plan.effort_minutes}min | Confidence: ${(plan.confidence * 100).toFixed(0)}%`);
      console.log(`   Impact Score: ${plan.impact_score.toFixed(2)}`);
      console.log(`   Sample: "${plan.sample_message.substring(0, 60)}..."\n`);
    });

    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('Next Steps:');
    console.log('  1. Review this plan');
    console.log('  2. Run P1.3 (apply) to execute fixes in dry-run mode');
    console.log('  3. Verify improvements with P1.4 (verify)\n');

  } catch (err) {
    log(`Fatal error: ${err.message}`, 'error');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

function classifyFixer(category) {
  const patterns = {
    'inference_error': 'health_check_and_restart',
    'type_mismatch': 'ast_fixer',
    'missing_field': 'schema_migration',
    'orphaned_reference': 'manual_audit',
    'validation_error': 'zod_validator'
  };
  return patterns[category] || 'manual_review';
}

function estimateEffort(category) {
  const estimates = {
    'inference_error': 15,
    'type_mismatch': 30,
    'missing_field': 45,
    'orphaned_reference': 60,
    'validation_error': 20
  };
  return estimates[category] || 90;
}

function estimateConfidence(category) {
  const confidences = {
    'inference_error': 0.90,
    'type_mismatch': 0.75,
    'missing_field': 0.85,
    'orphaned_reference': 0.60,
    'validation_error': 0.95
  };
  return confidences[category] || 0.50;
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
