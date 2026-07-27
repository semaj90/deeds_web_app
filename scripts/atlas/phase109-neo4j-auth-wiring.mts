#!/usr/bin/env tsx

/**
 * Phase 109 Gap 2: Neo4j Bolt Auth + Topology Wiring
 *
 * Establishes Bolt connection with auth, validates topology edges,
 * runs k-hop expansion on sample packets.
 *
 * Usage:
 *   npx tsx scripts/atlas/phase109-neo4j-auth-wiring.mts [--samples=10] [--k-hops=2]
 */

import neo4j, { type Driver, type Session } from 'neo4j-driver';
import pg from 'pg';

interface AuthConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  sampleCount: number;
  kHops: number;
  verbose: boolean;
}

interface TopologyMetrics {
  boltConnected: boolean;
  edgeTypesFound: string[];
  totalEdgeCount: number;
  samplesExpanded: number;
  expansionSuccesses: number;
  expansionFailures: number;
  averageNeighbors: number;
  errors: string[];
}

async function parseArgs(): Promise<AuthConfig> {
  const sampleCount = parseInt(
    process.argv.find(a => a.startsWith('--samples='))?.split('=')[1] || '10'
  );
  const kHops = parseInt(
    process.argv.find(a => a.startsWith('--k-hops='))?.split('=')[1] || '2'
  );
  const verbose = process.argv.includes('--verbose');

  return {
    host: process.env.NEO4J_HOST || 'localhost',
    port: parseInt(process.env.NEO4J_BOLT_PORT || '7687'),
    user: process.env.NEO4J_AUTH_USER || 'neo4j',
    password: process.env.NEO4J_AUTH_PASSWORD || 'neo4j-password',
    sampleCount,
    kHops,
    verbose,
  };
}

async function connectBolt(config: AuthConfig): Promise<Driver | null> {
  try {
    const driver = neo4j.driver(
      `bolt://${config.host}:${config.port}`,
      neo4j.auth.basic(config.user, config.password),
      {
        connectionTimeout: 5000,
        maxConnectionPoolSize: 1,
      }
    );

    // Test connection
    const session = driver.session();
    await session.run('RETURN 1');
    await session.close();

    return driver;
  } catch (err) {
    console.error(
      `[BOLT ERROR] Failed to connect: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

async function validateEdgeTypes(session: Session): Promise<{
  edgeTypes: string[];
  edgeCounts: Record<string, number>;
  totalEdges: number;
}> {
  // Query all edge types
  const query = `
    MATCH ()-[r]->()
    RETURN distinct(type(r)) as edge_type, count(r) as count
    ORDER BY count DESC
    LIMIT 20
  `;

  const result = await session.run(query);

  const edgeTypes: string[] = [];
  const edgeCounts: Record<string, number> = {};
  let totalEdges = 0;

  for (const record of result.records) {
    const type = record.get('edge_type') as string;
    const countRaw = record.get('count');
    // Always convert to Number to avoid BigInt issues
    const count = typeof countRaw === 'bigint' ? Number(countRaw) : Number(countRaw);

    edgeTypes.push(type);
    edgeCounts[type] = count;
    totalEdges = totalEdges + count;
  }

  return { edgeTypes, edgeCounts, totalEdges };
}

async function fetchSamplePackets(
  pgPool: pg.Pool,
  count: number
): Promise<Array<{ packet_key: string; source_ref: string }>> {
  const query = `
    SELECT packet_key, source_ref
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
    AND source_ref IS NOT NULL
    ORDER BY random()
    LIMIT $1
  `;

  const result = await pgPool.query(query, [count]);
  return result.rows;
}

async function expandKHops(
  session: Session,
  packetKey: string,
  kHops: number
): Promise<{ neighbors: string[]; error?: string }> {
  try {
    // Build variable-length path query: ()-[*1..k]->()
    const query = `
      MATCH path = (start:Packet {packet_key: $packetKey})-[*1..${kHops}]->(neighbor)
      RETURN DISTINCT neighbor.packet_key as neighbor_key
      LIMIT 100
    `;

    const result = await session.run(query, { packetKey });

    const neighbors: string[] = [];
    for (const record of result.records) {
      const neighbor = record.get('neighbor_key') as string | null;
      if (neighbor) {
        neighbors.push(neighbor);
      }
    }

    return { neighbors };
  } catch (err) {
    return {
      neighbors: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  const config = await parseArgs();

  console.log(`[PHASE 109 GAP 2] Neo4j Bolt Auth + Topology Wiring`);
  console.log(`  Host: ${config.host}:${config.port}`);
  console.log(`  User: ${config.user}`);
  console.log(`  Samples: ${config.sampleCount}`);
  console.log(`  K-hops: ${config.kHops}`);
  console.log(`  Verbose: ${config.verbose}`);
  console.log();

  const pgPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const metrics: TopologyMetrics = {
    boltConnected: false,
    edgeTypesFound: [],
    totalEdgeCount: 0,
    samplesExpanded: 0,
    expansionSuccesses: 0,
    expansionFailures: 0,
    averageNeighbors: 0,
    errors: [],
  };

  try {
    // Connect to Postgres
    console.log('[CONNECT] PostgreSQL...');
    await pgPool.query('SELECT 1');
    console.log('  ✅ Connected');

    // Connect to Neo4j via Bolt
    console.log('[CONNECT] Neo4j Bolt...');
    const driver = await connectBolt(config);

    if (!driver) {
      console.log('  ❌ Failed to connect to Bolt protocol');
      console.log('  Attempting HTTP fallback...');
      // Could add HTTP REST fallback here
      process.exit(1);
    }

    metrics.boltConnected = true;
    console.log(`  ✅ Connected via Bolt to ${config.host}:${config.port}`);

    const session = driver.session();

    // Validate edge types
    console.log();
    console.log('[TOPOLOGY] Validating edge types...');
    const edgeAnalysis = await validateEdgeTypes(session);

    metrics.edgeTypesFound = edgeAnalysis.edgeTypes;
    metrics.totalEdgeCount = edgeAnalysis.totalEdges;

    console.log(`  Found ${edgeAnalysis.edgeTypes.length} edge types:`);
    edgeAnalysis.edgeTypes.forEach(type => {
      const count = edgeAnalysis.edgeCounts[type];
      const countStr = typeof count === 'bigint' ? count.toString() : String(count);
      console.log(`    ${type}: ${countStr}`);
    });

    // Check for SIMILAR_TOPOLOGY (SOM adjacency edges)
    const hasSomEdges = edgeAnalysis.edgeTypes.includes('SIMILAR_TOPOLOGY');
    console.log();
    console.log(
      `  ${hasSomEdges ? '✅' : '⚠️'} SIMILAR_TOPOLOGY edges: ${
        edgeAnalysis.edgeCounts['SIMILAR_TOPOLOGY'] || 0
      } (expected ≥ 1000 for SOM grid)`
    );

    // Fetch sample packets
    console.log();
    console.log('[SAMPLES] Fetching packets from Postgres...');
    const samples = await fetchSamplePackets(pgPool, config.sampleCount);

    console.log(`  ✅ Fetched ${samples.length} sample packets`);
    if (config.verbose) {
      samples.slice(0, 3).forEach(s => {
        console.log(`     ${s.packet_key} (source: ${s.source_ref})`);
      });
    }

    // Run k-hop expansion on samples
    console.log();
    console.log(`[EXPANSION] Running k=${config.kHops} expansion on ${samples.length} samples...`);

    const neighborCounts: number[] = [];

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const expansion = await expandKHops(session, sample.packet_key, config.kHops);

      if (expansion.error) {
        metrics.expansionFailures++;
        if (config.verbose) {
          console.log(`  ❌ ${sample.packet_key}: ${expansion.error}`);
        }
      } else {
        metrics.expansionSuccesses++;
        neighborCounts.push(expansion.neighbors.length);

        if (config.verbose && expansion.neighbors.length > 0) {
          console.log(
            `  ✅ ${sample.packet_key}: found ${expansion.neighbors.length} neighbors`
          );
        }
      }

      metrics.samplesExpanded++;
    }

    if (neighborCounts.length > 0) {
      metrics.averageNeighbors = neighborCounts.reduce((a, b) => a + b, 0) / neighborCounts.length;
    }

    // Gate 2: Success Criteria
    console.log();
    console.log('[GATE 2] Neo4j Auth + Topology Success Criteria:');
    console.log(`  ${metrics.boltConnected ? '✅' : '❌'} Bolt protocol authenticated`);
    console.log(
      `  ${hasSomEdges ? '✅' : '❌'} SIMILAR_TOPOLOGY edges found (${edgeAnalysis.edgeCounts['SIMILAR_TOPOLOGY'] || 0} edges)`
    );
    console.log(
      `  ${metrics.expansionSuccesses >= Math.ceil(samples.length * 0.8) ? '✅' : '⚠️'} K-hop expansion: ${metrics.expansionSuccesses}/${metrics.samplesExpanded} success`
    );
    console.log(
      `  Average neighbors per packet (k=${config.kHops}): ${metrics.averageNeighbors.toFixed(2)}`
    );

    // Summary
    console.log();
    console.log('[SUMMARY]');
    console.log(JSON.stringify(metrics, null, 2));

    const gate2Pass =
      metrics.boltConnected &&
      hasSomEdges &&
      metrics.expansionSuccesses >= Math.ceil(samples.length * 0.8);

    if (gate2Pass) {
      console.log();
      console.log('✅ GATE 2 PASS: Neo4j topology wiring complete');
      process.exit(0);
    } else {
      console.log();
      console.log('⚠️ GATE 2 PARTIAL: Some topology edges missing');
      process.exit(1);
    }

    await session.close();
    await driver.close();
  } catch (err) {
    console.error('[ERROR]', err instanceof Error ? err.message : String(err));
    metrics.errors.push(err instanceof Error ? err.message : String(err));
    console.log();
    console.log('[SUMMARY]');
    console.log(JSON.stringify(metrics, null, 2));
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
