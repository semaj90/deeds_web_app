#!/usr/bin/env node

/**
 * Phase 3 Step 12: Feature Lane Materializers
 *
 * Extends the deterministic identity resolver output (Step 9) with five observation lanes:
 * 1. Semantic observations (embeddings, AST structure, intent)
 * 2. Lexical observations (BM25 tokens, language patterns, keywords)
 * 3. Structural observations (code structure, imports, exports, graph edges)
 * 4. Domain membership observations (feature classification, domain tags)
 * 5. Identity resolution observations (tree_node_id resolution, packet identity)
 *
 * Inputs:
 * - identity-resolution-results/results.ndjson (1,000 packets from Step 9)
 * - control-snapshot-1k/observations.ndjson (4,900 observations across 4 lanes)
 * - control-snapshot-1k/domain_hierarchy.json (domain taxonomy)
 *
 * Outputs:
 * - feature-lane-results/materialized-lanes.ndjson (packets with aggregated observations)
 * - feature-lane-results/lane-statistics.json (per-lane coverage metrics)
 * - feature-lane-results/materialization-audit.json (5 validation gates)
 *
 * Exit codes:
 * 0 = materialization complete, all gates pass
 * 1 = input file not found
 * 2 = observation parsing failed
 * 3 = materialization validation gate failed
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import crypto from 'crypto';
import { z } from 'zod';

// ============================================================================
// Zod Schemas for Feature Lane Materialization
// ============================================================================

const ObservationTypeEnum = z.enum([
  'embedding',
  'ast_structure',
  'bm25_token',
  'keyword',
  'import_reference',
  'export_reference',
  'function_call',
  'feature_tag',
  'domain_class',
  'tree_node_resolution',
]);

const EvidenceLaneEnum = z.enum([
  'semantic',
  'lexical',
  'structural',
  'domain_membership',
  'identity',
]);

const ObservationSchema = z.object({
  observation_id: z.string(),
  packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  observation_type: ObservationTypeEnum,
  evidence_lane: EvidenceLaneEnum,
  value: z.unknown(),
  source: z.string(),
  confidence: z.number().min(0).max(1),
  observed_at: z.string().datetime(),
});

type Observation = z.infer<typeof ObservationSchema>;

const MaterializedLaneSchema = z.object({
  packet_key: z.string(),
  feature_id: z.string().optional(),
  semantic_observations: z.array(ObservationSchema).optional(),
  lexical_observations: z.array(ObservationSchema).optional(),
  structural_observations: z.array(ObservationSchema).optional(),
  domain_membership_observations: z.array(ObservationSchema).optional(),
  identity_observations: z.array(ObservationSchema).optional(),
  aggregate_confidence: z.number().min(0).max(1),
  lane_count: z.number().min(0).max(5),
  observation_count: z.number(),
  materialized_at: z.string().datetime(),
});

type MaterializedLane = z.infer<typeof MaterializedLaneSchema>;

const LaneStatisticsSchema = z.object({
  lane_name: EvidenceLaneEnum,
  total_observations: z.number(),
  packets_covered: z.number(),
  coverage_percentage: z.number(),
  avg_confidence: z.number(),
  observation_types_count: z.record(z.string(), z.number()),
});

type LaneStatistics = z.infer<typeof LaneStatisticsSchema>;

const MaterializationGateSchema = z.object({
  gate_name: z.string(),
  gate_type: z.enum(['coverage', 'consistency', 'quality', 'completeness']),
  condition: z.string(),
  result: z.enum(['PASS', 'FAIL']),
  details: z.string(),
  metric_value: z.number().optional(),
  threshold_value: z.number().optional(),
});

type MaterializationGate = z.infer<typeof MaterializationGateSchema>;

// ============================================================================
// Feature Lane Materializer Engine
// ============================================================================

interface LaneAggregator {
  [lane: string]: Observation[];
}

async function loadIdentityResults(filePath: string): Promise<Map<string, any>> {
  console.log('Step 1: Loading identity resolution results...');
  const packets = new Map<string, any>();

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let count = 0;

    rl.on('line', (line) => {
      try {
        const row = JSON.parse(line);
        packets.set(row.packet_key, row);
        count++;
      } catch (e) {
        reject(new Error(`Failed to parse row ${count + 1}: ${e}`));
      }
    });

    rl.on('close', () => {
      console.log(`✓ Loaded ${count} identity-resolved packets`);
      resolve(packets);
    });

    rl.on('error', reject);
  });
}

async function loadObservations(filePath: string): Promise<Observation[]> {
  console.log('Step 2: Loading observations...');
  const observations: Observation[] = [];

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let count = 0;

    rl.on('line', (line) => {
      try {
        const row = JSON.parse(line);
        const parsed = ObservationSchema.parse(row);
        observations.push(parsed);
        count++;
      } catch (e) {
        reject(new Error(`Failed to parse observation ${count + 1}: ${e}`));
      }
    });

    rl.on('close', () => {
      console.log(`✓ Loaded ${count} observations across evidence lanes`);
      resolve(observations);
    });

    rl.on('error', reject);
  });
}

function aggregateObservationsByPacket(
  observations: Observation[]
): Map<string, LaneAggregator> {
  console.log('Step 3: Aggregating observations by packet and lane...');
  const aggregated = new Map<string, LaneAggregator>();

  for (const obs of observations) {
    if (!aggregated.has(obs.packet_key)) {
      aggregated.set(obs.packet_key, {
        semantic: [],
        lexical: [],
        structural: [],
        domain_membership: [],
        identity: [],
      });
    }

    const laneAgg = aggregated.get(obs.packet_key)!;
    laneAgg[obs.evidence_lane].push(obs);
  }

  console.log(
    `✓ Aggregated ${aggregated.size} packets with observation lanes`
  );
  return aggregated;
}

function computeAggregateConfidence(laneAgg: LaneAggregator): number {
  const allObs = Object.values(laneAgg).flat();
  if (allObs.length === 0) return 0;

  const avgConfidence =
    allObs.reduce((sum, obs) => sum + obs.confidence, 0) / allObs.length;
  return Math.min(1, Math.max(0, avgConfidence));
}

function materializeLanes(
  identityPackets: Map<string, any>,
  aggregated: Map<string, LaneAggregator>
): MaterializedLane[] {
  console.log('Step 4: Materializing feature lanes...');
  const materialized: MaterializedLane[] = [];
  let count = 0;

  for (const [packetKey, packet] of identityPackets) {
    const laneAgg = aggregated.get(packetKey) || {
      semantic: [],
      lexical: [],
      structural: [],
      domain_membership: [],
      identity: [],
    };

    const laneCount = Object.values(laneAgg).filter(
      (arr) => Array.isArray(arr) && arr.length > 0
    ).length;
    const observationCount = Object.values(laneAgg).flat().length;

    const materialized_row: MaterializedLane = {
      packet_key: packetKey,
      feature_id: packet.feature_id,
      semantic_observations:
        laneAgg.semantic.length > 0 ? laneAgg.semantic : undefined,
      lexical_observations:
        laneAgg.lexical.length > 0 ? laneAgg.lexical : undefined,
      structural_observations:
        laneAgg.structural.length > 0 ? laneAgg.structural : undefined,
      domain_membership_observations:
        laneAgg.domain_membership.length > 0
          ? laneAgg.domain_membership
          : undefined,
      identity_observations:
        laneAgg.identity.length > 0 ? laneAgg.identity : undefined,
      aggregate_confidence: computeAggregateConfidence(laneAgg),
      lane_count: laneCount,
      observation_count: observationCount,
      materialized_at: new Date().toISOString(),
    };

    materialized.push(materialized_row);
    count++;
  }

  console.log(`✓ Materialized ${count} packets with aggregated lanes`);
  return materialized;
}

function computeLaneStatistics(
  observations: Observation[],
  materializedPackets: MaterializedLane[]
): LaneStatistics[] {
  console.log('Step 5: Computing lane statistics...');
  const stats: Map<string, LaneStatistics> = new Map();

  const lanes: EvidenceLaneEnum[] = [
    'semantic',
    'lexical',
    'structural',
    'domain_membership',
    'identity',
  ];

  for (const lane of lanes) {
    const laneObs = observations.filter((o) => o.evidence_lane === lane);
    const packetsCovered = new Set(laneObs.map((o) => o.packet_key)).size;
    const coverage = (packetsCovered / materializedPackets.length) * 100;

    const typeCounts = laneObs.reduce((acc, obs) => {
      acc[obs.observation_type] = (acc[obs.observation_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgConfidence =
      laneObs.length > 0
        ? laneObs.reduce((sum, obs) => sum + obs.confidence, 0) / laneObs.length
        : 0;

    stats.set(lane, {
      lane_name: lane,
      total_observations: laneObs.length,
      packets_covered: packetsCovered,
      coverage_percentage: Math.round(coverage * 100) / 100,
      avg_confidence: Math.round(avgConfidence * 1000) / 1000,
      observation_types_count: typeCounts,
    });
  }

  console.log(`✓ Computed statistics for ${stats.size} lanes`);
  return Array.from(stats.values());
}

function runMaterializationGates(
  observations: Observation[],
  materializedPackets: MaterializedLane[],
  laneStats: LaneStatistics[]
): MaterializationGate[] {
  console.log('Step 6: Running materialization validation gates...');
  const gates: MaterializationGate[] = [];

  // Gate 1: Observation Coverage
  const obsWithData = materializedPackets.filter(
    (p) => p.observation_count > 0
  );
  const coverageGate: MaterializationGate = {
    gate_name: 'Observation Coverage',
    gate_type: 'coverage',
    condition: '≥80% of packets have at least one observation',
    result:
      obsWithData.length / materializedPackets.length >= 0.8
        ? 'PASS'
        : 'FAIL',
    details: `${obsWithData.length}/${materializedPackets.length} packets (${Math.round((obsWithData.length / materializedPackets.length) * 100)}%)`,
    metric_value: obsWithData.length,
    threshold_value: Math.ceil(materializedPackets.length * 0.8),
  };
  gates.push(coverageGate);

  // Gate 2: Lane Diversity
  const lanesWithObs = laneStats.filter((s) => s.total_observations > 0);
  const laneGate: MaterializationGate = {
    gate_name: 'Lane Diversity',
    gate_type: 'completeness',
    condition: '≥4 of 5 lanes present',
    result: lanesWithObs.length >= 4 ? 'PASS' : 'FAIL',
    details: `${lanesWithObs.length}/5 lanes populated`,
    metric_value: lanesWithObs.length,
    threshold_value: 4,
  };
  gates.push(laneGate);

  // Gate 3: Observation Diversity
  const totalObsTypes = new Set(observations.map((o) => o.observation_type))
    .size;
  const typeGate: MaterializationGate = {
    gate_name: 'Observation Type Diversity',
    gate_type: 'quality',
    condition: '≥5 distinct observation types',
    result: totalObsTypes >= 5 ? 'PASS' : 'FAIL',
    details: `${totalObsTypes} distinct observation types present`,
    metric_value: totalObsTypes,
    threshold_value: 5,
  };
  gates.push(typeGate);

  // Gate 4: Confidence Quality
  const avgConfidenceAll = Math.round(
    (materializedPackets.reduce((sum, p) => sum + p.aggregate_confidence, 0) /
      materializedPackets.length) *
      1000
  );
  const confGate: MaterializationGate = {
    gate_name: 'Confidence Quality',
    gate_type: 'quality',
    condition: 'avg aggregate_confidence ≥0.7',
    result: avgConfidenceAll / 1000 >= 0.7 ? 'PASS' : 'FAIL',
    details: `Average confidence: ${avgConfidenceAll / 1000}`,
    metric_value: avgConfidenceAll / 1000,
    threshold_value: 0.7,
  };
  gates.push(confGate);

  // Gate 5: Materialization Completeness
  const allGatesPass = gates.every((g) => g.result === 'PASS');
  const completeGate: MaterializationGate = {
    gate_name: 'Materialization Complete',
    gate_type: 'completeness',
    condition: 'All 4 gates pass',
    result: allGatesPass ? 'PASS' : 'FAIL',
    details: `${gates.filter((g) => g.result === 'PASS').length}/${gates.length - 1} prerequisite gates pass`,
    metric_value: gates.filter((g) => g.result === 'PASS').length,
    threshold_value: 4,
  };
  gates.push(completeGate);

  console.log(`✓ Ran 5 materialization gates`);
  return gates;
}

function writeNdjson(filePath: string, rows: any[]): void {
  const lines = rows.map((row) => JSON.stringify(row));
  writeFileSync(filePath, lines.join('\n') + '\n');
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  try {
    console.log('\nPhase 3 Step 12: Feature Lane Materializers');
    console.log('=============================================\n');

    // Resolve paths
    const resultsDir = resolve('identity-resolution-results');
    const outputDir = resolve('feature-lane-results');
    const snapshotDir = resolve('scripts/atlas/control-snapshot-1k');

    const identityPath = resolve(resultsDir, 'results.ndjson');
    const observationsPath = resolve(snapshotDir, 'observations.ndjson');
    const outputNdjson = resolve(outputDir, 'materialized-lanes.ndjson');
    const outputStats = resolve(outputDir, 'lane-statistics.json');
    const outputAudit = resolve(outputDir, 'materialization-audit.json');

    // Check inputs
    if (!existsSync(identityPath)) {
      console.error(`❌ Identity results not found: ${identityPath}`);
      console.error('Run Phase 3 Step 9 first: npm run phase3:identity:resolver');
      process.exit(2);
    }

    if (!existsSync(observationsPath)) {
      console.error(`❌ Observations not found: ${observationsPath}`);
      process.exit(2);
    }

    // Create output directory
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Load data
    const identityPackets = await loadIdentityResults(identityPath);
    const observations = await loadObservations(observationsPath);

    // Materialize lanes
    const aggregated = aggregateObservationsByPacket(observations);
    const materialized = materializeLanes(identityPackets, aggregated);
    const laneStats = computeLaneStatistics(observations, materialized);
    const gates = runMaterializationGates(observations, materialized, laneStats);

    // Write outputs
    console.log('\nStep 7: Writing results...');
    writeNdjson(outputNdjson, materialized);
    writeFileSync(outputStats, JSON.stringify(laneStats, null, 2));

    const auditReport = {
      materialization_timestamp: new Date().toISOString(),
      input_identity_packets: identityPackets.size,
      input_observations: observations.length,
      materialized_packets: materialized.length,
      lane_statistics: laneStats,
      gates,
      summary: {
        total_gates: gates.length,
        passed_gates: gates.filter((g) => g.result === 'PASS').length,
        failed_gates: gates.filter((g) => g.result === 'FAIL').length,
        overall_result:
          gates[gates.length - 1].result === 'PASS' ? 'PASS' : 'FAIL',
      },
    };

    writeFileSync(outputAudit, JSON.stringify(auditReport, null, 2));

    console.log(`✓ Wrote ${materialized.length} rows to ${outputNdjson}`);
    console.log(`✓ Wrote lane statistics to ${outputStats}`);
    console.log(`✓ Wrote audit report to ${outputAudit}`);

    // Print summary
    console.log('\n=============================================');
    console.log('Materialization Summary:');
    console.log('=============================================');
    console.log(
      `Packets materialized: ${materialized.length}/${identityPackets.size}`
    );
    console.log(`Total observations: ${observations.length}`);
    console.log(`Lane coverage: ${laneStats.map((s) => `${s.lane_name} ${s.packets_covered}/${materialized.length}`).join(', ')}`);
    console.log(`\nGate Results:`);
    gates.forEach((gate, idx) => {
      const icon = gate.result === 'PASS' ? '✓' : '❌';
      console.log(`  ${icon} Gate ${idx + 1} (${gate.gate_name}): ${gate.result}`);
    });

    console.log('\n✓ Phase 3 Step 12 complete');
    process.exit(auditReport.summary.overall_result === 'PASS' ? 0 : 3);
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
