#!/usr/bin/env node
/**
 * Phase 10: Smoke validation gate
 *
 * Verifies all Phase 10 components are in place and operational
 * Gates: Schema, tables, views, indexes, telemetry infrastructure
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

const GATES = [
  'packet_type_enum',
  'atlas_packets_columns',
  'tool_registry_columns',
  'tool_execution_log_table',
  'tool_execution_log_indexes',
  'tool_execution_stats_view',
];

async function validateGate(gateName, query) {
  try {
    const result = await pool.query(query);
    return { passed: result.rowCount > 0, data: result.rows };
  } catch (error) {
    return { passed: false, error: error.message };
  }
}

async function smokeValidation() {
  console.log('🧪 Phase 10: Smoke Validation Gate');
  console.log('');

  let passCount = 0;
  const results = [];

  // Gate 1: packet_type enum exists
  const g1 = await validateGate(
    'packet_type_enum',
    `SELECT enumlabel FROM pg_enum WHERE enumtypid IN (SELECT oid FROM pg_type WHERE typname='packet_type');`
  );
  if (g1.passed && g1.data.length === 8) {
    console.log('✅ Gate 1: packet_type enum exists (8 values)');
    passCount++;
  } else {
    console.log(`❌ Gate 1: packet_type enum missing or incomplete (found ${g1.data?.length || 0})`);
  }
  results.push({ gate: 'packet_type_enum', passed: g1.passed && g1.data?.length === 8 });

  // Gate 2: atlas_packets ontology columns
  const g2 = await validateGate(
    'atlas_packets_columns',
    `SELECT column_name FROM information_schema.columns WHERE table_name='atlas_packets' AND column_name IN ('packet_type', 'packet_ontology', 'parent_packet_key', 'related_packets', 'telemetry');`
  );
  if (g2.passed && g2.data.length === 5) {
    console.log('✅ Gate 2: atlas_packets ontology columns added (5 columns)');
    passCount++;
  } else {
    console.log(`❌ Gate 2: atlas_packets columns incomplete (found ${g2.data?.length || 0}/5)`);
  }
  results.push({ gate: 'atlas_packets_columns', passed: g2.passed && g2.data?.length === 5 });

  // Gate 3: tool_registry telemetry columns
  const g3 = await validateGate(
    'tool_registry_columns',
    `SELECT column_name FROM information_schema.columns WHERE table_name='tool_registry' AND column_name IN ('tool_capabilities', 'tool_constraints', 'tool_examples', 'tool_tags', 'failure_modes', 'timeout_count', 'schema_mismatch_count', 'false_positive_rate', 'rolling_success_rate_7d');`
  );
  if (g3.passed && g3.data.length === 9) {
    console.log('✅ Gate 3: tool_registry telemetry columns added (9 columns)');
    passCount++;
  } else {
    console.log(`❌ Gate 3: tool_registry columns incomplete (found ${g3.data?.length || 0}/9)`);
  }
  results.push({ gate: 'tool_registry_columns', passed: g3.passed && g3.data?.length === 9 });

  // Gate 4: tool_execution_log table exists
  const g4 = await validateGate(
    'tool_execution_log_table',
    `SELECT column_name FROM information_schema.columns WHERE table_name='tool_execution_log' AND column_name IN ('id', 'tool_id', 'query', 'success', 'latency_ms', 'error_type', 'timestamp');`
  );
  if (g4.passed && g4.data.length === 7) {
    console.log('✅ Gate 4: tool_execution_log table created (7 columns)');
    passCount++;
  } else {
    console.log(`❌ Gate 4: tool_execution_log table incomplete (found ${g4.data?.length || 0}/7)`);
  }
  results.push({ gate: 'tool_execution_log_table', passed: g4.passed && g4.data?.length === 7 });

  // Gate 5: tool_execution_log indexes exist
  const g5 = await validateGate(
    'tool_execution_log_indexes',
    `SELECT indexname FROM pg_indexes WHERE tablename='tool_execution_log' AND indexname LIKE 'idx_tool_exec_log%';`
  );
  if (g5.passed && g5.data.length >= 4) {
    console.log(`✅ Gate 5: tool_execution_log indexes created (${g5.data.length} indexes)`);
    passCount++;
  } else {
    console.log(`❌ Gate 5: tool_execution_log indexes incomplete (found ${g5.data?.length || 0}/4)`);
  }
  results.push({ gate: 'tool_execution_log_indexes', passed: g5.passed && g5.data?.length >= 4 });

  // Gate 6: tool_execution_stats_7d materialized view exists
  const g6 = await validateGate(
    'tool_execution_stats_7d_view',
    `SELECT attname as column_name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid WHERE n.nspname='public' AND c.relname='tool_execution_stats_7d' AND c.relkind='m' AND a.attnum > 0 ORDER BY a.attnum;`
  );
  if (g6.passed && g6.data.length === 8) {
    console.log('✅ Gate 6: tool_execution_stats_7d materialized view created (8 columns)');
    passCount++;
  } else {
    console.log(`❌ Gate 6: tool_execution_stats_7d view incomplete (found ${g6.data?.length || 0}/8)`);
  }
  results.push({ gate: 'tool_execution_stats_7d_view', passed: g6.passed && g6.data?.length === 8 });

  console.log('');
  console.log(`📊 Smoke Test Results: ${passCount}/${GATES.length} gates passed`);
  console.log('');

  if (passCount === GATES.length) {
    console.log('✨ Phase 10 smoke validation: PASS');
    console.log('Ready for Task Group 2-10 implementation');
    process.exit(0);
  } else {
    console.log('⚠️  Phase 10 smoke validation: FAIL');
    console.log('Failed gates:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   • ${r.gate}`);
    });
    process.exit(1);
  }
}

smokeValidation();
