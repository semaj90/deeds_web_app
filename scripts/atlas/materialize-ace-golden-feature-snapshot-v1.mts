import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  candidateOrdinalMapV1Schema,
  materializeCandidateOrdinalMap,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import {
  materializeCandidateFeatureSnapshot,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.js';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function parseArgs(argv: readonly string[]) {
  let ordinalMap = '.tmp/atlas/lineage-qualified-candidate-map-v1.json';
  let goldenReport = 'docs/reports/parent-atlas-golden-retrieval-v1.json';
  let graphReport = 'docs/reports/current-graph-feature-gather-v1.json';
  let outputMap = '.tmp/atlas/ace-golden-candidate-map-v1.json';
  let outputSnapshot = '.tmp/atlas/ace-candidate-feature-snapshot-v1.json';
  let report = 'docs/reports/ace-candidate-feature-snapshot-v1.json';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ordinal-map') ordinalMap = argv[++i] ?? ordinalMap;
    else if (arg === '--golden-report') goldenReport = argv[++i] ?? goldenReport;
    else if (arg === '--graph-report') graphReport = argv[++i] ?? graphReport;
    else if (arg === '--output-map') outputMap = argv[++i] ?? outputMap;
    else if (arg === '--output-snapshot') outputSnapshot = argv[++i] ?? outputSnapshot;
    else if (arg === '--report') report = argv[++i] ?? report;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm exec -- tsx scripts/atlas/materialize-ace-golden-feature-snapshot-v1.mts -- [--ordinal-map <file>] [--golden-report <file>] [--graph-report <file>] [--output-map <file>] [--output-snapshot <file>] [--report <file>]');
      process.exit(0);
    } else {
      throw new Error(`ACE_FEATURE_SNAPSHOT_UNKNOWN_ARGUMENT:${arg}`);
    }
  }

  return {
    ordinalMap: resolve(ordinalMap),
    goldenReport: resolve(goldenReport),
    graphReport: resolve(graphReport),
    outputMap: resolve(outputMap),
    outputSnapshot: resolve(outputSnapshot),
    report: resolve(report),
  };
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, 'utf8'));
}

function assertGoldenReplay(baseMap: ReturnType<typeof candidateOrdinalMapV1Schema.parse>, golden: any, graph: any): void {
  if (golden?.schema !== 'atlas.parent-atlas-golden-retrieval.v1' || golden?.status !== 'GOLDEN_RETRIEVAL_REPLAY_PROVEN') {
    throw new Error('ACE_FEATURE_SNAPSHOT_GOLDEN_REPLAY_NOT_PROVEN');
  }
  if (golden?.mode !== 'READ_ONLY_EXACT_REPLAY' || golden?.replay?.identical !== true) {
    throw new Error('ACE_FEATURE_SNAPSHOT_GOLDEN_REPLAY_NOT_DETERMINISTIC');
  }
  const writes = golden?.writes ?? {};
  if (writes.postgresWrites !== false || writes.qdrantWrites !== false || writes.redisWrites !== false || writes.neo4jWrites !== false) {
    throw new Error('ACE_FEATURE_SNAPSHOT_GOLDEN_REPLAY_WRITE_FLAG_PRESENT');
  }
  if (golden?.candidateMap?.candidateSnapshotRevision !== baseMap.candidateSnapshotRevision ||
      golden?.candidateMap?.ordinalMapChecksum !== baseMap.ordinalMapChecksum ||
      golden?.candidateMap?.workspaceRevision !== baseMap.workspaceRevision ||
      golden?.candidateMap?.rowCount !== baseMap.rowCount) {
    throw new Error('ACE_FEATURE_SNAPSHOT_GOLDEN_CANDIDATE_MAP_MISMATCH');
  }
  if (golden?.ranking?.exactSemantic768 !== true || golden?.ranking?.graphFeaturesAffectRanking !== false) {
    throw new Error('ACE_FEATURE_SNAPSHOT_GOLDEN_RANKING_CONTRACT_MISMATCH');
  }

  if (graph?.schema !== 'atlas.current-graph-feature-gather-v1' || graph?.status !== 'CURRENT_GRAPH_FEATURE_GATHER_PROVEN_BOUNDED') {
    throw new Error('ACE_FEATURE_SNAPSHOT_GRAPH_REPORT_NOT_PROVEN');
  }
  if (graph?.writesPerformed !== false || graph?.canonicalAuthority !== false) {
    throw new Error('ACE_FEATURE_SNAPSHOT_GRAPH_REPORT_AUTHORITY_OR_WRITE_MISMATCH');
  }
  if (graph?.workspaceRevision !== baseMap.workspaceRevision ||
      graph?.candidateSnapshotRevision !== baseMap.candidateSnapshotRevision ||
      graph?.ordinalMapChecksum !== baseMap.ordinalMapChecksum) {
    throw new Error('ACE_FEATURE_SNAPSHOT_GRAPH_CANDIDATE_MAP_MISMATCH');
  }
  if (golden?.graphFeatureJoin?.graphRevision !== graph?.graphRevision ||
      golden?.graphFeatureJoin?.featureRevision !== graph?.featureRevision) {
    throw new Error('ACE_FEATURE_SNAPSHOT_GRAPH_REVISION_MISMATCH');
  }

  const hits = Array.isArray(golden?.hits) ? golden.hits : [];
  if (hits.length !== baseMap.rowCount) throw new Error(`ACE_FEATURE_SNAPSHOT_HIT_COUNT_MISMATCH:${hits.length}:${baseMap.rowCount}`);
  const seen = new Set<number>();
  for (const hit of hits) {
    const ordinal = Number(hit?.candidateOrdinal);
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= baseMap.rowCount) {
      throw new Error(`ACE_FEATURE_SNAPSHOT_HIT_ORDINAL_INVALID:${String(hit?.candidateOrdinal)}`);
    }
    if (seen.has(ordinal)) throw new Error(`ACE_FEATURE_SNAPSHOT_HIT_ORDINAL_DUPLICATE:${ordinal}`);
    seen.add(ordinal);
    const candidate = baseMap.candidates[ordinal];
    if (!candidate || hit?.canonicalId !== candidate.canonicalId || hit?.packetKey !== candidate.packetKey || hit?.sourceRef !== candidate.sourceRef) {
      throw new Error(`ACE_FEATURE_SNAPSHOT_HIT_IDENTITY_MISMATCH:${ordinal}`);
    }
    if (!Number.isFinite(Number(hit?.score))) throw new Error(`ACE_FEATURE_SNAPSHOT_SEMANTIC_SCORE_INVALID:${ordinal}`);
  }
  for (let ordinal = 0; ordinal < baseMap.rowCount; ordinal += 1) {
    if (!seen.has(ordinal)) throw new Error(`ACE_FEATURE_SNAPSHOT_HIT_ORDINAL_MISSING:${ordinal}`);
  }

  const graphFeatures = Array.isArray(graph?.features) ? graph.features : [];
  if (graphFeatures.length !== Number(graph?.candidateCount ?? graphFeatures.length)) {
    throw new Error('ACE_FEATURE_SNAPSHOT_GRAPH_FEATURE_COUNT_MISMATCH');
  }
  for (const feature of graphFeatures) {
    const ordinal = Number(feature?.candidateOrdinal);
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= baseMap.rowCount) {
      throw new Error(`ACE_FEATURE_SNAPSHOT_GRAPH_ORDINAL_INVALID:${String(feature?.candidateOrdinal)}`);
    }
    if (!Number.isFinite(Number(feature?.pagerankMax))) {
      throw new Error(`ACE_FEATURE_SNAPSHOT_GRAPH_AUTHORITY_INVALID:${ordinal}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseMap = candidateOrdinalMapV1Schema.parse(await readJson(args.ordinalMap));
  const golden = await readJson(args.goldenReport);
  const graph = await readJson(args.graphReport);
  assertGoldenReplay(baseMap, golden, graph);

  if (baseMap.candidates.some((candidate) => candidate.semanticRevision === null)) {
    throw new Error('ACE_FEATURE_SNAPSHOT_BASE_MAP_SEMANTIC_REVISION_MISSING');
  }

  const graphRevision = String(graph.graphRevision);
  const evidenceRevisionHash = sha256({
    baseOrdinalMapChecksum: baseMap.ordinalMapChecksum,
    goldenReplayChecksum: golden.replay.firstChecksum,
    graphRevision,
    graphFeatureRevision: graph.featureRevision,
  });
  const candidateSnapshotRevision = `ace-golden-feature-snapshot:v1:${evidenceRevisionHash}`;
  const producerRevision = `ace-golden-feature-snapshot-producer:v1:${evidenceRevisionHash}`;
  const featureRevision = `sha256:${evidenceRevisionHash}`;

  const derivedMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision,
    workspaceRevision: baseMap.workspaceRevision,
    producerRevision,
    candidates: baseMap.candidates.map((candidate) => ({
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      graphRevision,
      semanticRevision: candidate.semanticRevision,
      degradedIdentity: candidate.degradedIdentity,
      evidenceRefs: [...new Set([
        ...candidate.evidenceRefs,
        `golden-retrieval:${golden.replay.firstChecksum}`,
        `graph-revision:${graphRevision}`,
      ])].sort(),
      representationBindings: candidate.representationBindings,
    })),
  });

  for (const candidate of derivedMap.candidates) {
    const prior = baseMap.candidates[candidate.candidateOrdinal];
    if (!prior || prior.canonicalId !== candidate.canonicalId || prior.packetKey !== candidate.packetKey || prior.sourceRevision !== candidate.sourceRevision) {
      throw new Error(`ACE_FEATURE_SNAPSHOT_DERIVED_ORDINAL_DRIFT:${candidate.candidateOrdinal}`);
    }
  }

  const hitByOrdinal = new Map<number, any>((golden.hits as any[]).map((hit) => [Number(hit.candidateOrdinal), hit]));
  const graphByOrdinal = new Map<number, any>((graph.features as any[]).map((feature) => [Number(feature.candidateOrdinal), feature]));

  const rows = derivedMap.candidates.map((candidate) => {
    const hit = hitByOrdinal.get(candidate.candidateOrdinal);
    if (!hit) throw new Error(`ACE_FEATURE_SNAPSHOT_HIT_MISSING:${candidate.candidateOrdinal}`);
    const graphFeature = graphByOrdinal.get(candidate.candidateOrdinal) ?? null;
    const laneMask = graphFeature ? ['semantic', 'graph'] as const : ['semantic'] as const;
    return {
      schema: 'atlas.candidate-feature-row.v1' as const,
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      graphRevision: candidate.graphRevision,
      semanticRevision: candidate.semanticRevision,
      featureRevision,
      representationBindings: candidate.representationBindings,
      semanticRelevance: Number(hit.score),
      lexicalRelevance: null,
      astAffinity: null,
      graphAuthority: graphFeature ? Number(graphFeature.pagerankMax) : null,
      personalizedPageRank: null,
      communityAffinity: null,
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: null,
      executionUtility: null,
      memoryUtility: null,
      laneMask: [...laneMask],
      degradedIdentity: candidate.degradedIdentity,
      evidenceRefs: [...new Set([
        ...candidate.evidenceRefs,
        `semantic-exact:${golden.replay.firstChecksum}:candidateOrdinal:${candidate.candidateOrdinal}`,
        ...(graphFeature ? [`graph-feature:${graphRevision}:candidateOrdinal:${candidate.candidateOrdinal}`] : []),
      ])].sort(),
    };
  });

  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap: derivedMap,
    rows,
    featureRevision,
    producerRevision,
  });

  const graphFeatureRows = rows.filter((row) => row.graphAuthority !== null).length;
  const report = {
    schema: 'atlas.ace-candidate-feature-snapshot-receipt.v1',
    status: 'ACE_CANDIDATE_FEATURE_SNAPSHOT_READY',
    mode: 'READ_ONLY_FROZEN_ARTIFACT_COMPOSITION',
    sourceArtifacts: {
      baseCandidateSnapshotRevision: baseMap.candidateSnapshotRevision,
      baseOrdinalMapChecksum: baseMap.ordinalMapChecksum,
      goldenReplayChecksum: golden.replay.firstChecksum,
      graphRevision,
      graphFeatureRevision: graph.featureRevision,
    },
    derived: {
      candidateSnapshotRevision: derivedMap.candidateSnapshotRevision,
      ordinalMapChecksum: derivedMap.ordinalMapChecksum,
      snapshotChecksum: snapshot.snapshotChecksum,
      featureRevision: snapshot.featureRevision,
      candidateCount: snapshot.rowCount,
      semanticFeatureRows: rows.filter((row) => row.semanticRelevance !== null).length,
      graphFeatureRows,
      graphAbsentRows: snapshot.rowCount - graphFeatureRows,
      ordinalsPreserved: true,
      canonicalOwnerChanged: false,
      identityAuthority: false,
    },
    semantics: {
      semanticScoreOwner: 'parent-atlas-golden-retrieval-v1 exact semantic_768 score',
      graphAuthorityOwner: 'current-graph-feature-gather-v1 pagerankMax -> authority_norm precedent',
      graphRevisionAppliesToCandidateUniverse: true,
      missingGraphFeaturePolicy: 'NULL_WITHOUT_ZERO_SUBSTITUTION',
      rankingPromotion: false,
    },
    writesPerformed: false,
    databaseWritesPerformed: false,
    qdrantWritesPerformed: false,
    graphWritesPerformed: false,
    cacheWritesPerformed: false,
    canonicalAuthority: false,
    outputMap: args.outputMap,
    outputSnapshot: args.outputSnapshot,
    nextGate: 'REVISION_AUTHORITY_ENVELOPE_MATERIALIZATION_THEN_ACE_LIVE_DRY_INPUT_READINESS',
  } as const;

  await mkdir(dirname(args.outputMap), { recursive: true });
  await mkdir(dirname(args.outputSnapshot), { recursive: true });
  await mkdir(dirname(args.report), { recursive: true });
  await writeFile(args.outputMap, `${JSON.stringify(derivedMap, null, 2)}\n`, 'utf8');
  await writeFile(args.outputSnapshot, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
