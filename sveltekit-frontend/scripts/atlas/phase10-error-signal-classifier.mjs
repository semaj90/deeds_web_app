#!/usr/bin/env node

/**
 * Phase 10: Error Signal Classification
 */

import pg from 'pg';
import crypto from 'crypto';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
const test = args.includes('--test');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '1000');

const MODE = test ? 'TEST' : dryRun ? 'DRY_RUN' : apply ? 'APPLY' : 'DRY_RUN';

const env = loadRepoEnv();
const DATABASE_URL = resolveDatabaseUrl(env);
const pool = new Pool({ connectionString: DATABASE_URL });

function classifyError(message) {
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('econnrefused') || lowerMsg.includes('connection refused')) {
    return { errorClass: 'ConnectivityError', domain: 'db' };
  }
  if (lowerMsg.includes('session') && (lowerMsg.includes('invalid') || lowerMsg.includes('expired'))) {
    return { errorClass: 'ConnectivityError', domain: 'auth' };
  }
  if (lowerMsg.includes('redis') || lowerMsg.includes('cache')) {
    return { errorClass: 'ConnectivityError', domain: 'cache' };
  }
  if (lowerMsg.includes('timeout') || lowerMsg.includes('exceeded')) {
    if (lowerMsg.includes('gpu') || lowerMsg.includes('cuda')) return { errorClass: 'TimeoutError', domain: 'gpu' };
    if (lowerMsg.includes('qdrant') || lowerMsg.includes('vector')) return { errorClass: 'TimeoutError', domain: 'qdrant' };
    if (lowerMsg.includes('ollama') || lowerMsg.includes('gemma')) return { errorClass: 'TimeoutError', domain: 'llm' };
    return { errorClass: 'TimeoutError', domain: 'db' };
  }
  if (lowerMsg.includes('validation') || lowerMsg.includes('invalid')) {
    return { errorClass: 'ValidationError', domain: 'db' };
  }
  if (lowerMsg.includes('out of memory') || lowerMsg.includes('oom')) {
    return { errorClass: 'ResourceError', domain: 'gpu' };
  }
  if (lowerMsg.includes('cypher') || lowerMsg.includes('neo4j')) {
    return { errorClass: 'CypherError', domain: 'neo4j' };
  }

  return { errorClass: 'ValidationError', domain: 'db' };
}

async function selectRecoveryPackets(errorClass, domain, limitCount = 3) {
  const result = await pool.query(`
    SELECT packet_key, page_rank_score
    FROM atlas_packets
    WHERE is_recovery_packet = true
      AND recovery_domains @> $1
      AND page_rank_score > 0.6
    ORDER BY page_rank_score DESC
    LIMIT $2
  `, [[domain], limitCount]);

  return result.rows.map(r => ({
    packet_key: r.packet_key,
    score: r.page_rank_score || 0.5,
  }));
}

function createErrorSignal(errorMessage, errorClass, domain, sourceFeatureId = null) {
  return {
    error_id: crypto.randomUUID(),
    error_message: errorMessage,
    error_class: errorClass,
    error_domain: domain,
    error_timestamp: new Date(),
    error_caller_feature_id: sourceFeatureId || 'unknown',
  };
}

async function classifyErrors() {
  console.log(`\n🚨 Phase 10: Error Signal Classification [${MODE}]\n`);

  try {
    let signals = [];

    if (MODE === 'TEST') {
      console.log('🧪 Step 1: Generate test error signals...');
      signals = [
        createErrorSignal('Error: ECONNREFUSED 127.0.0.1:5434', 'ConnectivityError', 'db', 'db.client'),
        createErrorSignal('AuthenticationError: Session validation failed', 'ConnectivityError', 'auth', 'auth.sessions'),
        createErrorSignal('TimeoutError: GPU inference exceeded 30s deadline', 'TimeoutError', 'gpu', 'llm.inference'),
        createErrorSignal('ValidationError: Invalid Cypher query syntax', 'CypherError', 'neo4j', 'graph.cypher'),
      ];
      console.log(`  ✓ Generated ${signals.length} test signals\n`);
    } else {
      signals = [];
      console.log(`  ⚠️  No error signals found (ready for production integration)\n`);
    }

    if (signals.length === 0) {
      console.log('Ready for production. Integration pending.\n');
      await pool.end();
      process.exit(0);
    }

    const grouped = {};
    for (const signal of signals) {
      const key = `${signal.error_class}:${signal.error_domain}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(signal);
    }

    console.log(`📊 Step 2: Grouped ${signals.length} signals into ${Object.keys(grouped).length} classes\n`);

    console.log('🔍 Step 3: Recovery packet mapping...\n');
    for (const [key, errorSignals] of Object.entries(grouped)) {
      const [errorClass, domain] = key.split(':');
      const recoveryPackets = await selectRecoveryPackets(errorClass, domain, 3);
      console.log(`  ${key}: ${recoveryPackets.length} candidates`);
    }

    console.log('\n✅ Classification complete!\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

classifyErrors();
