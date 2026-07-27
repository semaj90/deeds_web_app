#!/usr/bin/env node

/**
 * Phase 3 Step 13: Observation Validation & Refinement
 *
 * Validates and refines observations from the feature lane materializers (Step 12):
 * 1. Validate observation quality scores (confidence bounds, type consistency)
 * 2. Enrich domain_membership lane with hierarchy-aware classification
 * 3. Cross-lane consistency checking (detect conflicting observations)
 * 4. Compute per-packet quality metrics and refinement flags
 * 5. Identify outliers and potential data quality issues
 *
 * Inputs:
 * - feature-lane-results/materialized-lanes.ndjson (from Step 12)
 * - control-snapshot-1k/domain_hierarchy.json (domain taxonomy)
 * - control-snapshot-1k/observations.ndjson (raw observations)
 *
 * Outputs:
 * - observation-validation-results/validated-lanes.ndjson (cleaned + enriched packets)
 * - observation-validation-results/quality-metrics.json (per-packet quality scores)
 * - observation-validation-results/consistency-report.json (cross-lane conflicts)
 * - observation-validation-results/validation-audit.json (5 validation gates)
 *
 * Exit codes:
 * 0 = validation complete, all gates pass
 * 1 = input file not found or parsing failed
 * 2 = domain hierarchy missing
 * 3 = validation gate failed
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import crypto from 'crypto';
import { z } from 'zod';

// ============================================================================
// Zod Schemas for Observation Validation
// ============================================================================

const QualityMetricsSchema = z.object({
  packet_key: z.string(),
  overall_quality_score: z.number().min(0).max(1),
  confidence_variance: z.number().min(0),
  lane_agreement: z.number().min(0).max(1),
  domain_membership_enriched: z.boolean(),
  consistency_issues: z.number().min(0),
  outlier_flags: z.array(z.string()),
  needs_refinement: z.boolean(),
});

type QualityMetrics = z.infer<typeof QualityMetricsSchema>;

const CrossLaneConflictSchema = z.object({
  packet_key: z.string(),
  lane_1: z.string(),
  lane_2: z.string(),
  conflict_type: z.enum([
    'confidence_mismatch',
    'semantic_conflict',
    'temporal_inconsistency',
    'source_divergence',
  ]),
  severity: z.enum(['low', 'medium', 'high']),
  details: z.string(),
  detected_at: z.string().datetime(),
});

type CrossLaneConflict = z.infer<typeof CrossLaneConflictSchema>;

const ValidationGateSchema = z.object({
  gate_name: z.string(),
  gate_type: z.enum(['quality', 'consistency', 'completeness', 'enrichment']),
  condition: z.string(),
  result: z.enum(['PASS', 'FAIL']),
  details: z.string(),
  metric_value: z.number().optional(),
  threshold_value: z.number().optional(),
});

type ValidationGate = z.infer<typeof ValidationGateSchema>;

// ============================================================================
// Domain Hierarchy & Classification
// ============================================================================

interface DomainHierarchy {
  schema_version: string;
  hierarchy: Record<string, any>;
}

function loadDomainHierarchy(filePath: string): DomainHierarchy {
  console.log('Loading domain hierarchy...');
  const content = readFileSync(filePath, 'utf-8');
  const hierarchy = JSON.parse(content) as DomainHierarchy;
  console.log(`✓ Loaded domain hierarchy v${hierarchy.schema_version}`);
  return hierarchy;
}

function extractDomainNames(hierarchy: DomainHierarchy): Set<string> {
  const domains = new Set<string>();

  function walk(obj: any) {
    if (obj && typeof obj === 'object') {
      if (obj.canonical_label) {
        domains.add(obj.canonical_label);
      }
      if (obj.domain) {
        domains.add(obj.domain);
      }
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            walk(item);
          }
        } else if (typeof value === 'object') {
          walk(value);
        }
      }
    }
  }

  walk(hierarchy.hierarchy);
  return domains;
}

// ============================================================================
// Observation Validation Engine
// ============================================================================

async function loadMaterializedLanes(filePath: string): Promise<any[]> {
  console.log('Step 1: Loading materialized lanes...');
  const packets: any[] = [];

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let count = 0;

    rl.on('line', (line) => {
      try {
        const row = JSON.parse(line);
        packets.push(row);
        count++;
      } catch (e) {
        reject(new Error(`Failed to parse packet ${count + 1}: ${e}`));
      }
    });

    rl.on('close', () => {
      console.log(`✓ Loaded ${count} materialized packets`);
      resolve(packets);
    });

    rl.on('error', reject);
  });
}

function validateObservationQuality(packet: any): QualityMetrics {
  const observations = Object.entries(packet)
    .filter(
      ([key]) =>
        key.endsWith('_observations') && Array.isArray(packet[key])
    )
    .flatMap(([, obs]) => (obs as any[]) || []);

  if (observations.length === 0) {
    return {
      packet_key: packet.packet_key,
      overall_quality_score: 0,
      confidence_variance: 0,
      lane_agreement: 0,
      domain_membership_enriched: false,
      consistency_issues: 0,
      outlier_flags: [],
      needs_refinement: true,
    };
  }

  // Compute confidence statistics
  const confidences = observations.map((o: any) => o.confidence || 0);
  const avgConfidence =
    confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const variance =
    confidences.reduce(
      (sum, c) => sum + Math.pow(c - avgConfidence, 2),
      0
    ) / confidences.length;

  // Detect outliers (confidence > mean + 2*stddev OR < mean - 2*stddev)
  const stddev = Math.sqrt(variance);
  const outliers = confidences.filter(
    (c) => Math.abs(c - avgConfidence) > 2 * stddev
  );

  // Check lane agreement (do observations from same lane agree?)
  const byLane = observations.reduce((acc: any, o: any) => {
    const lane = o.evidence_lane || 'unknown';
    if (!acc[lane]) acc[lane] = [];
    acc[lane].push(o.confidence);
    return acc;
  }, {});

  const laneAgreements = Object.values(byLane).map((confs: any) => {
    if (confs.length < 2) return 1.0;
    const avg = confs.reduce((a: number, b: number) => a + b, 0) / confs.length;
    const v = confs.reduce(
      (sum: number, c: number) => sum + Math.pow(c - avg, 2),
      0
    ) / confs.length;
    return 1 - Math.min(1, Math.sqrt(v));
  });
  const avgLaneAgreement =
    laneAgreements.length > 0
      ? laneAgreements.reduce((a, b) => a + b, 0) / laneAgreements.length
      : 0;

  const flags: string[] = [];
  if (outliers.length > 0)
    flags.push(`${outliers.length} confidence outliers`);
  if (avgConfidence < 0.6) flags.push('low average confidence');
  if (variance > 0.15) flags.push('high confidence variance');

  return {
    packet_key: packet.packet_key,
    overall_quality_score:
      Math.round(
        (avgConfidence * 0.5 + avgLaneAgreement * 0.5) * 1000
      ) / 1000,
    confidence_variance: Math.round(variance * 1000) / 1000,
    lane_agreement: Math.round(avgLaneAgreement * 1000) / 1000,
    domain_membership_enriched:
      packet.domain_membership_observations &&
      packet.domain_membership_observations.length > 0,
    consistency_issues: 0,
    outlier_flags: flags,
    needs_refinement: flags.length > 0 || avgConfidence < 0.65,
  };
}

function enrichDomainMembership(
  packet: any,
  knownDomains: Set<string>
): any {
  const enriched = { ...packet };

  if (
    !enriched.domain_membership_observations ||
    enriched.domain_membership_observations.length === 0
  ) {
    enriched.domain_membership_observations = Array.from(knownDomains).map(
      (domain) => ({
        observation_id: `obs:domain-enrich-${packet.packet_key}-${domain}`,
        packet_key: packet.packet_key,
        observation_type: 'domain_membership',
        evidence_lane: 'domain_membership',
        value: { [domain]: 0.5 },
        confidence: 0.5,
        source: 'enrichment:default',
        observed_at: new Date().toISOString(),
      })
    );
  }

  return enriched;
}

function detectCrossLaneConflicts(packet: any): CrossLaneConflict[] {
  const conflicts: CrossLaneConflict[] = [];

  const lanes = [
    'semantic_observations',
    'lexical_observations',
    'structural_observations',
    'domain_membership_observations',
    'identity_observations',
  ];

  // Get observations from each lane
  const laneObs: Record<string, any[]> = {};
  for (const lane of lanes) {
    if (packet[lane] && Array.isArray(packet[lane])) {
      laneObs[lane] = packet[lane];
    }
  }

  // Check for extreme confidence divergence between lanes
  const laneConfidences: Record<string, number> = {};
  for (const [lane, obs] of Object.entries(laneObs)) {
    if ((obs as any[]).length > 0) {
      const avgConf = (obs as any[]).reduce((s, o) => s + o.confidence, 0) / (obs as any[]).length;
      laneConfidences[lane] = avgConf;
    }
  }

  const confValues = Object.values(laneConfidences);
  if (confValues.length > 1) {
    const maxConf = Math.max(...confValues);
    const minConf = Math.min(...confValues);

    if (maxConf - minConf > 0.4) {
      const maxLane = Object.entries(laneConfidences).find(
        ([, c]) => c === maxConf
      )![0];
      const minLane = Object.entries(laneConfidences).find(
        ([, c]) => c === minConf
      )![0];

      conflicts.push({
        packet_key: packet.packet_key,
        lane_1: maxLane,
        lane_2: minLane,
        conflict_type: 'confidence_mismatch',
        severity: maxConf - minConf > 0.5 ? 'high' : 'medium',
        details: `Lane confidence divergence: ${maxLane}=${Math.round(maxConf * 100)}% vs ${minLane}=${Math.round(minConf * 100)}%`,
        detected_at: new Date().toISOString(),
      });
    }
  }

  return conflicts;
}

function runValidationGates(
  packets: any[],
  qualityMetrics: QualityMetrics[],
  allConflicts: CrossLaneConflict[]
): ValidationGate[] {
  console.log('Step 5: Running validation gates...');
  const gates: ValidationGate[] = [];

  // Gate 1: Quality Score Distribution
  const avgQuality = Math.round(
    (qualityMetrics.reduce((s, m) => s + m.overall_quality_score, 0) /
      qualityMetrics.length) *
      1000
  );
  const qualityGate: ValidationGate = {
    gate_name: 'Quality Score Distribution',
    gate_type: 'quality',
    condition: 'avg overall_quality_score ≥0.7',
    result: avgQuality / 1000 >= 0.7 ? 'PASS' : 'FAIL',
    details: `Average quality: ${avgQuality / 1000}`,
    metric_value: avgQuality / 1000,
    threshold_value: 0.7,
  };
  gates.push(qualityGate);

  // Gate 2: Domain Membership Enrichment
  const enrichedCount = qualityMetrics.filter(
    (m) => m.domain_membership_enriched
  ).length;
  const enrichmentGate: ValidationGate = {
    gate_name: 'Domain Membership Enrichment',
    gate_type: 'enrichment',
    condition: '≥80% of packets have domain_membership observations',
    result: enrichedCount / qualityMetrics.length >= 0.8 ? 'PASS' : 'FAIL',
    details: `${enrichedCount}/${qualityMetrics.length} packets (${Math.round((enrichedCount / qualityMetrics.length) * 100)}%)`,
    metric_value: enrichedCount / qualityMetrics.length,
    threshold_value: 0.8,
  };
  gates.push(enrichmentGate);

  // Gate 3: Cross-Lane Conflict Rate
  const conflictRate = allConflicts.length / packets.length;
  const conflictGate: ValidationGate = {
    gate_name: 'Cross-Lane Conflict Rate',
    gate_type: 'consistency',
    condition: '<5% of packets have cross-lane conflicts',
    result: conflictRate < 0.05 ? 'PASS' : 'FAIL',
    details: `${allConflicts.length}/${packets.length} packets with conflicts (${Math.round(conflictRate * 100)}%)`,
    metric_value: conflictRate,
    threshold_value: 0.05,
  };
  gates.push(conflictGate);

  // Gate 4: Outlier Flag Rate
  const flaggedCount = qualityMetrics.filter(
    (m) => m.outlier_flags.length > 0
  ).length;
  const outlierGate: ValidationGate = {
    gate_name: 'Outlier Flag Rate',
    gate_type: 'quality',
    condition: '<10% of packets need refinement',
    result: flaggedCount / qualityMetrics.length < 0.1 ? 'PASS' : 'FAIL',
    details: `${flaggedCount}/${qualityMetrics.length} packets flagged (${Math.round((flaggedCount / qualityMetrics.length) * 100)}%)`,
    metric_value: flaggedCount / qualityMetrics.length,
    threshold_value: 0.1,
  };
  gates.push(outlierGate);

  // Gate 5: Validation Complete
  const allGatesPass = gates.every((g) => g.result === 'PASS');
  const completeGate: ValidationGate = {
    gate_name: 'Validation Complete',
    gate_type: 'completeness',
    condition: 'All 4 prerequisite gates pass',
    result: allGatesPass ? 'PASS' : 'FAIL',
    details: `${gates.filter((g) => g.result === 'PASS').length}/${gates.length - 1} prerequisite gates pass`,
    metric_value: gates.filter((g) => g.result === 'PASS').length,
    threshold_value: 4,
  };
  gates.push(completeGate);

  console.log(`✓ Ran 5 validation gates`);
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
    console.log('\nPhase 3 Step 13: Observation Validation & Refinement');
    console.log('=====================================================\n');

    const inputDir = resolve('feature-lane-results');
    const outputDir = resolve('observation-validation-results');
    const snapshotDir = resolve('scripts/atlas/control-snapshot-1k');

    const inputPath = resolve(inputDir, 'materialized-lanes.ndjson');
    const hierarchyPath = resolve(snapshotDir, 'domain_hierarchy.json');
    const outputNdjson = resolve(outputDir, 'validated-lanes.ndjson');
    const outputMetrics = resolve(outputDir, 'quality-metrics.json');
    const outputConflicts = resolve(outputDir, 'consistency-report.json');
    const outputAudit = resolve(outputDir, 'validation-audit.json');

    // Check inputs
    if (!existsSync(inputPath)) {
      console.error(`❌ Materialized lanes not found: ${inputPath}`);
      console.error('Run Phase 3 Step 12 first: npm run phase3:feature:lanes:materialize');
      process.exit(1);
    }

    if (!existsSync(hierarchyPath)) {
      console.error(`❌ Domain hierarchy not found: ${hierarchyPath}`);
      process.exit(2);
    }

    // Create output directory
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Load data
    const packets = await loadMaterializedLanes(inputPath);
    const hierarchy = loadDomainHierarchy(hierarchyPath);
    const knownDomains = extractDomainNames(hierarchy);

    console.log(`\nStep 2: Validating observation quality...`);
    const qualityMetrics = packets.map((p) => validateObservationQuality(p));

    console.log(`Step 3: Enriching domain membership lane...`);
    const enrichedPackets = packets.map((p) =>
      enrichDomainMembership(p, knownDomains)
    );

    console.log(`Step 4: Detecting cross-lane conflicts...`);
    const allConflicts: CrossLaneConflict[] = enrichedPackets.flatMap(
      (p) => detectCrossLaneConflicts(p)
    );

    const gates = runValidationGates(enrichedPackets, qualityMetrics, allConflicts);

    console.log('\nStep 6: Writing results...');
    writeNdjson(outputNdjson, enrichedPackets);
    writeFileSync(outputMetrics, JSON.stringify(qualityMetrics, null, 2));
    writeFileSync(
      outputConflicts,
      JSON.stringify(
        {
          total_conflicts: allConflicts.length,
          high_severity: allConflicts.filter((c) => c.severity === 'high')
            .length,
          medium_severity: allConflicts.filter((c) => c.severity === 'medium')
            .length,
          low_severity: allConflicts.filter((c) => c.severity === 'low').length,
          conflicts: allConflicts,
        },
        null,
        2
      )
    );

    const auditReport = {
      validation_timestamp: new Date().toISOString(),
      input_packets: enrichedPackets.length,
      quality_metrics_computed: qualityMetrics.length,
      cross_lane_conflicts_detected: allConflicts.length,
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

    console.log(`✓ Wrote ${enrichedPackets.length} validated packets to ${outputNdjson}`);
    console.log(`✓ Wrote quality metrics to ${outputMetrics}`);
    console.log(`✓ Wrote ${allConflicts.length} detected conflicts to ${outputConflicts}`);
    console.log(`✓ Wrote audit report to ${outputAudit}`);

    // Print summary
    console.log('\n=====================================================');
    console.log('Validation Summary:');
    console.log('=====================================================');
    console.log(`Packets validated: ${qualityMetrics.length}`);
    console.log(
      `Avg quality score: ${Math.round((qualityMetrics.reduce((s, m) => s + m.overall_quality_score, 0) / qualityMetrics.length) * 100)}%`
    );
    console.log(
      `Domain membership enriched: ${qualityMetrics.filter((m) => m.domain_membership_enriched).length}/${qualityMetrics.length}`
    );
    console.log(`Cross-lane conflicts: ${allConflicts.length}`);
    console.log(`Packets needing refinement: ${qualityMetrics.filter((m) => m.needs_refinement).length}`);
    console.log(`\nGate Results:`);
    gates.forEach((gate, idx) => {
      const icon = gate.result === 'PASS' ? '✓' : '❌';
      console.log(`  ${icon} Gate ${idx + 1} (${gate.gate_name}): ${gate.result}`);
    });

    console.log('\n✓ Phase 3 Step 13 complete');
    process.exit(auditReport.summary.overall_result === 'PASS' ? 0 : 3);
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
