#!/usr/bin/env node

/**
 * Parent Atlas Memory Refresh Stage
 *
 * Consolidates tool execution stats, packet registry, packet summaries,
 * and Engram local memory into a unified parent_atlas_route_decisions
 * ledger, enabling ACE/Gemma4 to make directionally-correct recovery
 * routing decisions.
 *
 * Usage:
 *   npm run atlas:parent:memory:dry       # dry-run, no writes
 *   npm run atlas:parent:memory:apply     # live update
 *
 * Pipeline:
 *   tool_execution_stats (7d)
 *   + tool_registry
 *   + atlas_packet_registry
 *   + packet summaries
 *   + Engram/local memory
 *   → parent_atlas_route_decisions (Postgres)
 *   → ACE/Gemma4 context packets
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

// ── Configuration ────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const ENGRAM_MEMORY_PATH = join(__dirname, '../../.claude/projects/c--Users-james-Videos-deeds-web-app/memory');

// ── SQL ──────────────────────────────────────────────────────────────────

const SQL_PARENT_ATLAS_ROUTE_DECISIONS = `
  CREATE TABLE IF NOT EXISTS parent_atlas_route_decisions (
    id SERIAL PRIMARY KEY,
    packet_key VARCHAR(255) UNIQUE NOT NULL,
    tool_execution_count_7d INT DEFAULT 0,
    tool_success_rate_7d REAL DEFAULT 0.0,
    packet_registry_confidence REAL DEFAULT 0.0,
    summary_available BOOLEAN DEFAULT FALSE,
    engram_memory_signal REAL DEFAULT 0.0,
    composite_score REAL GENERATED ALWAYS AS (
      0.35 * COALESCE(tool_success_rate_7d, 0)
      + 0.25 * COALESCE(packet_registry_confidence, 0)
      + 0.20 * COALESCE(engram_memory_signal, 0)
      + 0.20 * (CASE WHEN summary_available THEN 1.0 ELSE 0.0 END)
    ) STORED,
    route_decision VARCHAR(50) DEFAULT 'canonical',
    last_updated TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_parent_atlas_composite_score
    ON parent_atlas_route_decisions (composite_score DESC);

  CREATE INDEX IF NOT EXISTS idx_parent_atlas_route_decision
    ON parent_atlas_route_decisions (route_decision);
`;

// ── Data Aggregators ─────────────────────────────────────────────────────

async function fetchToolExecutionStats(pool) {
  try {
    // Stub: would query tool_execution_stats table if it exists
    const res = await pool.query(`
      SELECT
        COALESCE(COUNT(*), 0) AS execution_count,
        COALESCE(AVG(CASE WHEN success THEN 1 ELSE 0 END), 0.0) AS success_rate
      FROM tool_execution_stats
      WHERE executed_at >= NOW() - INTERVAL '7 days'
      GROUP BY tool_name
      LIMIT 100
    `).catch(() => ({ rows: [] }));

    const stats = {};
    for (const row of res.rows) {
      stats[row.tool_name || 'unknown'] = {
        count: row.execution_count,
        successRate: row.success_rate,
      };
    }
    return stats;
  } catch {
    return {};
  }
}

async function fetchPacketRegistry(pool) {
  try {
    const res = await pool.query(`
      SELECT
        packet_key,
        CASE
          WHEN source_ref IS NOT NULL AND feature_id IS NOT NULL THEN 0.95
          WHEN source_ref IS NOT NULL THEN 0.75
          WHEN feature_id IS NOT NULL THEN 0.60
          ELSE 0.30
        END AS confidence
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      LIMIT 10000
    `).catch(() => ({ rows: [] }));

    const registry = {};
    for (const row of res.rows) {
      registry[row.packet_key] = row.confidence;
    }
    return registry;
  } catch {
    return {};
  }
}

async function fetchPacketSummaries(pool) {
  try {
    const res = await pool.query(`
      SELECT
        packet_key,
        TRUE AS summary_available
      FROM codebase_chunk_index
      WHERE packet_key IS NOT NULL
        AND summary IS NOT NULL
        AND LENGTH(TRIM(summary)) > 20
      LIMIT 10000
    `).catch(() => ({ rows: [] }));

    const summaries = {};
    for (const row of res.rows) {
      summaries[row.packet_key] = row.summary_available;
    }
    return summaries;
  } catch {
    return {};
  }
}

function loadEngramMemory() {
  try {
    const memoryDir = ENGRAM_MEMORY_PATH;
    if (!existsSync(memoryDir)) {
      return {};
    }

    // Look for memory files related to packet routing or route decisions
    const engramSignals = {};
    const files = [
      join(memoryDir, 'route-decisions.json'),
      join(memoryDir, 'parent-atlas-frozen-identity-contract.md'),
      join(memoryDir, 'unified-retrieval-algorithm-execution-plan.md'),
    ];

    for (const file of files) {
      if (existsSync(file)) {
        const content = readFileSync(file, 'utf8');
        // Simple heuristic: if file mentions decision/routing, signal 0.6
        if (content.includes('decision') || content.includes('routing') || content.includes('route')) {
          engramSignals[file] = 0.6;
        }
      }
    }

    return engramSignals;
  } catch (err) {
    if (verbose) console.warn('[Engram Memory] Load error:', err.message);
    return {};
  }
}

// ── Main Logic ───────────────────────────────────────────────────────────

async function refreshParentAtlasMemory() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  Parent Atlas Memory Refresh Stage                         ║');
    console.log(`║  Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}${' '.repeat(dryRun ? 38 : 45)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // 1. Create schema if needed
    if (!dryRun) {
      console.log('[Schema] Creating parent_atlas_route_decisions table...');
      await pool.query(SQL_PARENT_ATLAS_ROUTE_DECISIONS);
    } else {
      console.log('[Schema] (dry-run) Would create parent_atlas_route_decisions table');
    }

    // 2. Fetch all data sources
    console.log('\n[Data Sources] Fetching...');
    const toolStats = await fetchToolExecutionStats(pool);
    const packetRegistry = await fetchPacketRegistry(pool);
    const packetSummaries = await fetchPacketSummaries(pool);
    const engramSignals = loadEngramMemory();

    console.log(`  ✓ Tool execution stats: ${Object.keys(toolStats).length} tools`);
    console.log(`  ✓ Packet registry: ${Object.keys(packetRegistry).length} packets`);
    console.log(`  ✓ Packet summaries: ${Object.keys(packetSummaries).length} with summaries`);
    console.log(`  ✓ Engram signals: ${Object.keys(engramSignals).length} sources`);

    // 3. Compute composite scores for all packets
    console.log('\n[Routing Decisions] Computing composite scores...');
    const decisions = [];

    for (const [packetKey, registryConf] of Object.entries(packetRegistry)) {
      const toolCount = toolStats[packetKey]?.count || 0;
      const toolSuccess = toolStats[packetKey]?.successRate || 0.0;
      const hasSummary = packetSummaries[packetKey] || false;
      const engramSignal = Math.max(...Object.values(engramSignals), 0.0);

      // Composite score: 0.35·tool_success + 0.25·registry + 0.20·engram + 0.20·summary
      const compositeScore =
        0.35 * toolSuccess +
        0.25 * registryConf +
        0.20 * engramSignal +
        0.20 * (hasSummary ? 1.0 : 0.0);

      // Route decision logic
      let routeDecision = 'canonical';
      if (compositeScore < 0.4) {
        routeDecision = 'recoverable';
      } else if (compositeScore < 0.2) {
        routeDecision = 'quarantine';
      }

      decisions.push({
        packet_key: packetKey,
        tool_execution_count_7d: toolCount,
        tool_success_rate_7d: toolSuccess,
        packet_registry_confidence: registryConf,
        summary_available: hasSummary,
        engram_memory_signal: engramSignal,
        route_decision: routeDecision,
      });
    }

    console.log(`  ✓ Computed ${decisions.length} route decisions`);
    const canonical = decisions.filter((d) => d.route_decision === 'canonical').length;
    const recoverable = decisions.filter((d) => d.route_decision === 'recoverable').length;
    const quarantine = decisions.filter((d) => d.route_decision === 'quarantine').length;
    console.log(`    - Canonical: ${canonical}`);
    console.log(`    - Recoverable: ${recoverable}`);
    console.log(`    - Quarantine: ${quarantine}`);

    // 4. Upsert into Postgres
    if (!dryRun) {
      console.log('\n[Postgres] Upserting route decisions...');
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const upsertSQL = `
          INSERT INTO parent_atlas_route_decisions (
            packet_key,
            tool_execution_count_7d,
            tool_success_rate_7d,
            packet_registry_confidence,
            summary_available,
            engram_memory_signal,
            route_decision,
            last_updated
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (packet_key) DO UPDATE SET
            tool_execution_count_7d = $2,
            tool_success_rate_7d = $3,
            packet_registry_confidence = $4,
            summary_available = $5,
            engram_memory_signal = $6,
            route_decision = $7,
            last_updated = NOW()
        `;

        let upserted = 0;
        for (const decision of decisions) {
          await client.query(upsertSQL, [
            decision.packet_key,
            decision.tool_execution_count_7d,
            decision.tool_success_rate_7d,
            decision.packet_registry_confidence,
            decision.summary_available,
            decision.engram_memory_signal,
            decision.route_decision,
          ]);
          upserted++;

          if (verbose && upserted % 100 === 0) {
            console.log(`  ✓ ${upserted} packets upserted`);
          }
        }

        await client.query('COMMIT');
        console.log(`  ✓ All ${upserted} packets upserted (COMMIT)`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      console.log(`\n[Postgres] (dry-run) Would upsert ${decisions.length} route decisions`);
    }

    // 5. Summary stats
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  Parent Atlas Memory Refresh Complete                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\nRoute Decisions Ready for ACE/Gemma4:`);
    console.log(`  • Canonical packets: ${canonical} (use directly)`);
    console.log(`  • Recoverable packets: ${recoverable} (reconstruct via HMM)`);
    console.log(`  • Quarantine packets: ${quarantine} (escalate to operator)`);
    console.log(`\nNext steps:`);
    console.log(`  1. Run: npm run atlas:daily:graphify:cold`);
    console.log(`  2. Run: npm run atlas:phase1:tree-node:backfill:dry`);
    console.log(`  3. Verify route decision distribution with:`);
    console.log(`     SELECT route_decision, COUNT(*) FROM parent_atlas_route_decisions GROUP BY route_decision;`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (verbose) console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// ── Run ──────────────────────────────────────────────────────────────────

refreshParentAtlasMemory();
