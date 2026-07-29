#!/usr/bin/env npx tsx
/**
 * QW-3: Measure SemanticSignalV1 JSON Sizes
 * Bounds ACE context window budget (4.8KB assembly limit)
 */

import { gzipSync } from 'zlib';

interface SemanticSignal {
  id: string;
  workspaceId: string;
  revisionId: string;
  subjectId: string;
  signalType: string;
  producer: string;
  producerModelRevision?: string;
  producerSchemaVersion?: string;
  evidenceIds: string[];
  evidenceConfidence?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

// Sample signals with varying evidence array lengths
const samples: Record<string, SemanticSignal> = {
  minimal: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    workspaceId: 'workspace-1',
    revisionId: 'rev-1',
    subjectId: 'packet:001',
    signalType: 'DOMAIN_CLASS',
    producer: 'domain_classifier_v1',
    evidenceIds: ['postgres:packet:001'],
    createdAt: '2026-07-29T00:00:00Z',
    updatedAt: '2026-07-29T00:00:00Z',
  },
  small: {
    id: '550e8400-e29b-41d4-a716-446655440001',
    workspaceId: 'workspace-2',
    revisionId: 'rev-2',
    subjectId: 'packet:002',
    signalType: 'INTENT_TAG',
    producer: 'intent_analyzer_v1',
    producerSchemaVersion: '1.0',
    evidenceIds: [
      'postgres:packet:002',
      'ast_node:func_main',
      'qdrant:chunk:012',
    ],
    evidenceConfidence: 0.85,
    createdAt: '2026-07-29T00:00:00Z',
    updatedAt: '2026-07-29T00:00:00Z',
    createdBy: 'system:classifier',
  },
  medium: {
    id: '550e8400-e29b-41d4-a716-446655440002',
    workspaceId: 'workspace-3',
    revisionId: 'rev-3',
    subjectId: 'packet:003',
    signalType: 'RETRIEVAL_LANE',
    producer: 'lane_planner_v1',
    producerSchemaVersion: '1.0',
    evidenceIds: [
      'postgres:packet:003',
      'ast_node:func_search',
      'ast_node:class_retriever',
      'qdrant:chunk:120',
      'qdrant:chunk:121',
      'neo4j:node:retrieval_node',
      'neo4j:edge:imports_relation',
      'postgres:feature:retrieval.core',
    ],
    evidenceConfidence: 0.92,
    createdAt: '2026-07-29T00:00:00Z',
    updatedAt: '2026-07-29T00:00:00Z',
    createdBy: 'system:planner',
  },
  large: {
    id: '550e8400-e29b-41d4-a716-446655440003',
    workspaceId: 'workspace-4',
    revisionId: 'rev-4',
    subjectId: 'packet:004',
    signalType: 'CLASSIFICATION',
    producer: 'classifier_v2',
    producerModelRevision: 'sha256:abc123def456',
    producerSchemaVersion: '2.0',
    evidenceIds: Array.from({ length: 20 }, (_, i) => `evidence:${i}`).concat([
      'postgres:packet:004',
      'qdrant:chunk:200',
      'qdrant:chunk:201',
      'qdrant:chunk:202',
      'neo4j:node:auth_node',
      'neo4j:edge:auth_flow',
      'postgres:feature:auth.sessions',
      'postgres:feature:auth.validation',
      'postgres:label:auth:primary',
    ]),
    evidenceConfidence: 0.78,
    createdAt: '2026-07-29T00:00:00Z',
    updatedAt: '2026-07-29T00:00:00Z',
    createdBy: 'system:classifier',
  },
};

interface SizeMeasurement {
  sampleName: string;
  evidenceCount: number;
  uncompressed: number;
  gzipped: number;
  compressionRatio: number;
  signalsPerAce: number; // How many fit in 4.8KB ACE budget
}

function measureSignalSize(name: string, signal: SemanticSignal): SizeMeasurement {
  const json = JSON.stringify(signal);
  const uncompressed = Buffer.byteLength(json, 'utf8');
  const gzipped = gzipSync(json).length;

  const aceBudget = 4.8 * 1024; // 4,915 bytes
  const signalsPerAce = Math.floor(aceBudget / uncompressed);

  return {
    sampleName: name,
    evidenceCount: signal.evidenceIds.length,
    uncompressed,
    gzipped,
    compressionRatio: (gzipped / uncompressed).toFixed(2) as any,
    signalsPerAce: Math.max(1, signalsPerAce),
  };
}

function main() {
  console.log('🔍 SemanticSignalV1 Size Analysis\n');
  console.log('='.repeat(80));

  const measurements: SizeMeasurement[] = [];

  for (const [name, signal] of Object.entries(samples)) {
    const m = measureSignalSize(name, signal);
    measurements.push(m);
  }

  // Print table
  console.log('\nSizes by Sample:');
  console.table(measurements);

  // Calculate statistics
  const avgUncompressed =
    measurements.reduce((s, m) => s + m.uncompressed, 0) / measurements.length;
  const maxUncompressed = Math.max(...measurements.map((m) => m.uncompressed));
  const avgGzipped = measurements.reduce((s, m) => s + m.gzipped, 0) / measurements.length;

  console.log('\n📊 Summary Statistics:');
  console.log(`  Average uncompressed: ${avgUncompressed.toFixed(0)} bytes`);
  console.log(`  Max uncompressed: ${maxUncompressed} bytes`);
  console.log(`  Average gzipped: ${avgGzipped.toFixed(0)} bytes`);
  console.log(`  Best compression ratio: ${(Math.min(...measurements.map((m) => m.compressionRatio)) as any).toFixed(2)}`);
  console.log(`  Worst compression ratio: ${(Math.max(...measurements.map((m) => m.compressionRatio)) as any).toFixed(2)}`);

  // ACE Assembly Budget Analysis
  console.log('\n🎯 ACE Assembly Budget (4,915 bytes):');
  const aceMax = Math.max(...measurements.map((m) => m.signalsPerAce));
  const aceMin = Math.min(...measurements.map((m) => m.signalsPerAce));
  console.log(`  Best case (minimal signal): ${aceMax} signals fit in 4.8KB`);
  console.log(`  Worst case (large signal): ${aceMin} signals fit in 4.8KB`);
  console.log(
    `  Recommendation: Include max ${aceMin} signals per ACE assembly to stay within budget`
  );

  // Evidence array impact
  console.log('\n📈 Evidence Array Impact:');
  const byEvidenceCount = measurements.sort(
    (a, b) => a.evidenceCount - b.evidenceCount
  );
  for (const m of byEvidenceCount) {
    const bytesPerEvidence = m.uncompressed / Math.max(m.evidenceCount, 1);
    console.log(
      `  ${m.evidenceCount} evidence refs: ${m.uncompressed} bytes (${bytesPerEvidence.toFixed(0)} bytes/ref)`
    );
  }

  // Compression recommendation
  console.log('\n💾 Compression Strategy:');
  const avgCompression = measurements.reduce(
    (s, m) => s + (m.compressionRatio as any),
    0
  ) / measurements.length;
  console.log(`  Average compression: ${(avgCompression as any).toFixed(2)}x`);
  if (avgCompression > 0.5) {
    console.log(
      '  ✅ Gzip compression is EFFECTIVE (>50% reduction)'
    );
    console.log('     Cache signals as: gzipped JSON in Redis + uncompressed for Postgres');
  } else {
    console.log('  ⚠️  Gzip compression is MARGINAL (<50% reduction)');
    console.log('     Use selective compression: only compress signals with >20 evidence refs');
  }

  console.log('\n='.repeat(80));
  console.log('✅ Size analysis complete. Results:');
  console.log(`   - Minimum signal: ${measurements[0].uncompressed} bytes`);
  console.log(`   - Maximum signal: ${measurements[measurements.length - 1].uncompressed} bytes`);
  console.log(
    `   - Signals per ACE: ${aceMin}-${aceMax} depending on evidence array size`
  );
}

main();
