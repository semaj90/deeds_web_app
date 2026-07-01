#!/usr/bin/env node
/**
 * Evaluate ontology/KAG readiness from Parent Atlas candidate artifacts.
 *
 * This is a proof/evaluation lane, not a canonical write path. It turns the
 * ontology evaluation criteria into measurable signals over the current
 * tuple/candidate surfaces and emits agentic next-try recommendations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
  else if (arg.startsWith('--')) args.set(arg.slice(2), 'true');
}

const CANDIDATES = path.resolve(REPO_ROOT, String(args.get('candidates') ?? '.tmp/turbovec-candidates.ndjson'));
const TUPLES = path.resolve(REPO_ROOT, String(args.get('tuples') ?? '.tmp/source-tuples-all.ndjson'));
const OUT_JSON = path.resolve(REPO_ROOT, String(args.get('out-json') ?? 'docs/reports/ontology-kag-readiness.json'));
const OUT_MD = path.resolve(REPO_ROOT, String(args.get('out-md') ?? 'docs/reports/ontology-kag-readiness.md'));
const TURBOVEC_PROOF = path.resolve(REPO_ROOT, String(args.get('turbovec-proof') ?? 'docs/reports/turbovec-ann-grpc-proof.json'));
const LIMIT = Number(args.get('limit') ?? 5000);

const DOMAIN_HINTS = [
  'agent', 'atlas', 'cache', 'cluster', 'code', 'embed', 'graph', 'knowledge',
  'legal', 'mcp', 'memory', 'rank', 'repair', 'search', 'trace', 'retrieval',
  'qdrant', 'postgres', 'redis', 'neo4j', 'rabbitmq', 'turbovec', 'gemma4',
];

const COARSE_FEATURE_IDS = new Set([
  'src', 'lib', 'routes', 'api', 'db', 'ai', 'server', 'client', 'components',
  'scripts', 'docs', 'test', 'tests', 'utils',
]);

function readJsonl(filePath, limit = Infinity) {
  const rows = [];
  if (!fs.existsSync(filePath)) return rows;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
      if (rows.length >= limit) break;
    } catch {
      // Ignore malformed rows; tuple report already tracks malformed rows.
    }
  }
  return rows;
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function pct(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

function score(part, total) {
  if (!total) return 0;
  return Number(Math.max(0, Math.min(1, part / total)).toFixed(4));
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function featureIdLooksCanonical(value) {
  const text = String(value ?? '').trim();
  if (!text || COARSE_FEATURE_IDS.has(text)) return false;
  return text.includes('.') || text.startsWith('repo.file.') || text.includes('-') || text.includes('_');
}

function trigrams(text) {
  const normalized = String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const grams = [];
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i <= tokens.length - n; i++) grams.push(tokens.slice(i, i + n).join(' '));
  }
  return grams;
}

function topCounts(rows, selector, limit = 20) {
  const counts = new Map();
  for (const row of rows) {
    const values = selector(row);
    for (const value of Array.isArray(values) ? values : [values]) {
      const key = String(value ?? '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function quantile(values, q) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)));
  return sorted[idx];
}

function average(values) {
  const safe = values.filter((v) => Number.isFinite(v));
  if (!safe.length) return 0;
  return safe.reduce((sum, value) => sum + value, 0) / safe.length;
}

function relationCount(row, names) {
  const rel = row.relation_counts ?? {};
  return names.reduce((sum, name) => sum + Number(rel[name] ?? 0), 0);
}

function validationVectorFor(row, graphStats) {
  const rel = row.relation_counts ?? {};
  const identityFields = [row.packet_key, row.source_ref, row.feature_id].filter(hasText).length;
  const symbolCount = Array.isArray(row.symbols) ? row.symbols.length : 0;
  const structuralCount = relationCount(row, ['IMPORTS', 'IMPORTS_DYNAMIC', 'EXPORTS', 'DEFINES', 'ROUTE_HANDLES']);
  const runtimeCount = relationCount(row, ['USES_POSTGRES', 'USES_REDIS_CACHE', 'USES_VECTOR_SEARCH', 'USES_QDRANT', 'USES_NEO4J', 'USES_RABBITMQ', 'MCP_TOOL']);
  const riskCount = Number(rel.RISK_SIGNAL ?? 0);
  const tupleCount = Math.max(Number(row.tuple_count ?? 0), 1);
  const degree = graphStats.degreeByPacket.get(row.packet_key) ?? 0;
  const featureSize = graphStats.featureSize.get(row.feature_id) ?? 0;
  const authorityScore = Number(row.scores?.graph_authority_score ?? 0);

  return {
    lexical: score(symbolCount, 8),
    taxonomic: score((featureIdLooksCanonical(row.feature_id) ? 1 : 0) + (hasText(row.domain_class) ? 1 : 0), 2),
    semantic: Number(Math.max(0, Math.min(1, Number(row.scores?.semantic_score ?? 0))).toFixed(4)),
    contextual: score((hasText(row.content_ref) ? 1 : 0) + Math.min(runtimeCount, 4), 5),
    syntactic: score(identityFields, 3),
    structural: score(structuralCount, Math.max(tupleCount, 1)),
    completeness: score(identityFields + (hasText(row.content_ref) ? 1 : 0) + (symbolCount > 0 ? 1 : 0) + (featureIdLooksCanonical(row.feature_id) ? 1 : 0), 6),
    consistency: Number(Math.max(0, Math.min(1, 1 - score(riskCount, Math.max(tupleCount, 1)))).toFixed(4)),
    coupling: Number(Math.max(0, Math.min(1, score(runtimeCount + degree, 50))).toFixed(4)),
    modularity: Number(Math.max(0, Math.min(1, 1 - score(featureSize, 500))).toFixed(4)),
    connectivity: score(degree + structuralCount, 80),
    authority: authorityScore > 0 ? score(authorityScore, 1) : score(row.score ?? 0, 1),
  };
}

function mutationAttempts(metric, reason) {
  const base = {
    lexical: [
      'Generate 1-3 trigram aliases from symbols, feature_label, and relation_counts.',
      'Backfill missing keywords into metadata.keywords without changing feature_id.',
      'Run BM25/pg_trgm comparison against candidate source_ref and symbols.',
    ],
    taxonomic: [
      'Add HAS_A edges from packet -> symbols and IS_A edges from feature_id -> domain_class.',
      'Reject coarse labels such as db/routes/ai as feature_id and keep them in domain_class.',
      'Project feature_id/domain_class pairs into KAG nodes for traversal proof.',
    ],
    semantic: [
      'Embed candidate context with EmbeddingGemma 768 and compare summary_embedding similarity.',
      'Run LangExtract over candidate summaries to normalize entities/actions/dependencies.',
      'Ask Gemma4 for a 2-3 sentence purpose only after ranked evidence is assembled.',
    ],
    context: [
      'Compare candidate dependencies with source tuples and existing Qdrant payload tags.',
      'Attach retrieval lanes ACE/KAG/DAG/RLM as context metadata, not identity.',
      'Use sibling packets sharing source_ref_key or feature_id for multi-hop context.',
    ],
    syntactic: [
      'Validate feature envelope JSON with Zod before mirror fanout.',
      'Reject rows with missing packet_key/source_ref/feature_id in RPC responses.',
      'Run ast-grep parser checks before accepting structural tuples.',
    ],
    structural: [
      'Project IMPORTS/DEFINES/EXPORTS/USES_* tuples into Neo4j bounded edges.',
      'Detect loops, duplicate definitions, and high-tangledness packets before PageRank.',
      'Use SOM 20x20 only as topology neighborhood metadata after embeddings exist.',
    ],
    application: [
      'Run HyperRAG packet RPC smoke and require packet_key/source_ref/feature_id survival.',
      'Persist ACE/KAG/DAG hit provenance for accepted recommendations.',
      'Create kanban task cards only from candidates with direct proof artifacts.',
    ],
    data_driven: [
      'Compare ontology coverage against atlas_packets corpus and source tuple corpus.',
      'Use Qdrant payload mirror coverage as contextual evidence only.',
      'Record missing domain/topology/ontology fields as coverage debt.',
    ],
    user_based: [
      'Expose top weak ontology clusters to the operator board for review.',
      'Store operator accepted/rejected recommendations as replay reward evidence.',
      'Do not mark DONE until replay/eval confirms improvement.',
    ],
    completeness: [
      'Backfill missing domain_class, ontology_label, and topology_label from feature envelopes.',
      'Require packet_key/source_ref/feature_id/content_ref before promotion to KAG node.',
      'Attach LangExtract entities/actions/dependencies after summaries are embedded.',
    ],
    consistency: [
      'Reject coarse feature_id values and preserve them as metadata.path_label/domain_class.',
      'Deduplicate concepts with identical definitions but different names before Neo4j projection.',
      'Run contradiction checks between Qdrant payload mirrors and Postgres canonical fields.',
    ],
    coupling: [
      'Flag high-coupling packets for split/review instead of boosting them blindly.',
      'Use coupling as a routing warning for agentic patch planning.',
      'Prefer lower-coupling sibling packets when retrieval scores tie.',
    ],
    modularity: [
      'Group packets into feature modules before summary synthesis.',
      'Create reusable feature envelopes for repeated symbol/dependency clusters.',
      'Split over-large feature groups into subdomains before SOM training.',
    ],
    connectivity: [
      'Project tuple edges into Neo4j and compute bounded PageRank later.',
      'Find orphan packets with zero structural/runtime edges.',
      'Add KAG traversal proof for connected packets before board promotion.',
    ],
    authority: [
      'Compute PageRank/GDS authority after Neo4j projection, not before embeddings.',
      'Use authority as rerank metadata rather than identity.',
      'Compare authority score against replay success before boosting recommendations.',
    ],
  };
  return (base[metric] ?? ['Inspect this metric manually.']).map((action, idx) => ({
    attempt: idx + 1,
    action,
    reason,
  }));
}

function ganStatus({ created, wired, proven, accepted = false }) {
  if (created && wired && proven && accepted) return 'DONE';
  if (created && wired && proven) return 'PROVEN';
  if (created && wired) return 'WIRED';
  if (created) return 'CREATED';
  return 'MISSING';
}

function buildGanProofMatrix({ metrics, validationVector, counts, sourceArtifacts, acceleratorProof }) {
  const rows = [
    {
      category: 'lexical',
      implementation: 'Compare symbols, identifiers, comments, summaries, and trigrams against LangExtract/domain vocabulary.',
      created: true,
      wired: counts.candidates > 0,
      proven: metrics.lexical.score >= 0.85 && validationVector.lexical >= 0.85,
      evidence: ['symbols/trigrams in turbovec candidates', sourceArtifacts.candidates],
      missing: metrics.lexical.score >= 0.85 ? [] : ['controlled vocabulary precision/recall/F1 against LangExtract labels'],
      proof_command: 'npm run atlas:ontology-kag:readiness',
    },
    {
      category: 'taxonomic',
      implementation: 'Verify IS_A, PART_OF/HAS_A, IMPLEMENTS, EXTENDS, and hierarchy edges from AST/source tuples.',
      created: true,
      wired: counts.candidates > 0,
      proven: metrics.taxonomic.score >= 0.85 && counts.domain_class > 0,
      evidence: ['feature_id coverage plus domain_class coverage', sourceArtifacts.candidates],
      missing: ['domain_class coverage is low', 'HAS_A/IS_A projection to KAG/Neo4j not proven'],
      proof_command: 'npm run atlas:ontology-kag:readiness',
    },
    {
      category: 'semantic',
      implementation: 'Use embeddings and graph consistency to detect incompatible relationships between concepts.',
      created: true,
      wired: counts.candidates > 0,
      proven: Boolean(acceleratorProof?.gates?.pass),
      evidence: [
        'tuple-derived semantic candidate score exists',
        acceleratorProof?.gates?.pass ? 'TurboVec ANN gRPC proof PASS over Qdrant vectors' : 'TurboVec ANN gRPC proof missing or not passing',
        sourceArtifacts.turbovec_proof,
      ].filter(Boolean),
      missing: acceleratorProof?.gates?.pass
        ? ['summary embedding similarity', 'graph consistency proof']
        : ['EmbeddingGemma/Qdrant vectors loaded into TurboVec ANN', 'summary embedding similarity', 'graph consistency proof'],
      proof_command: 'npm run atlas:turbovec:ann-grpc:proof && npm run atlas:ontology-kag:readiness',
    },
    {
      category: 'context',
      implementation: 'Compare concepts with neighboring modules, source_ref siblings, docs, and linked retrieval context.',
      created: true,
      wired: counts.bounded_context_refs > 0,
      proven: metrics.context.score >= 0.85,
      evidence: ['bounded packet context refs', sourceArtifacts.candidates],
      missing: validationVector.contextual >= 0.85 ? [] : ['neighbor module/document comparison still partial'],
      proof_command: 'npm run atlas:ontology-kag:readiness',
    },
    {
      category: 'syntactic',
      implementation: 'Validate AST integrity, schema correctness, Zod/JSON schema, protobuf/gRPC, and RPC contracts.',
      created: true,
      wired: counts.with_packet_key > 0,
      proven: metrics.syntactic.score >= 0.95 && validationVector.syntactic >= 0.95,
      evidence: ['packet_key/source_ref/feature_id contract fields', sourceArtifacts.candidates],
      missing: [],
      proof_command: 'npm run atlas:ontology-kag:readiness && npm run verify:rpc-gan',
    },
    {
      category: 'structural',
      implementation: 'Detect orphans, duplicates, cycles, disconnected subgraphs, coupling, and missing core concepts.',
      created: true,
      wired: counts.structural_edges > 0,
      proven: metrics.structural.score >= 0.85,
      evidence: ['IMPORTS/EXPORTS/DEFINES/ROUTE_HANDLES source tuples', sourceArtifacts.tuples],
      missing: validationVector.connectivity >= 0.85 ? [] : ['Neo4j projection/PageRank/GDS not yet proven for this candidate set'],
      proof_command: 'npm run atlas:source-tuples:apply && npm run atlas:ontology-kag:readiness',
    },
    {
      category: 'application',
      implementation: 'Measure whether retrieval, summarization, KAG/DAG traversal, and agent tasks improve after updates.',
      created: true,
      wired: counts.kag_ready > 0,
      proven: metrics.application.score >= 0.85,
      evidence: ['KAG-ready relation coverage in candidates'],
      missing: ['HyperRAG packet RPC replay proof', 'ACE/KAG/DAG provenance persistence', 'operator accepted/rejected signal'],
      proof_command: 'npm run smoke:hyperrag-packet-rpc && npm run atlas:ontology-kag:readiness',
    },
    {
      category: 'data_driven',
      implementation: 'Compare ontology coverage against the full corpus of extracted packets and tuples.',
      created: true,
      wired: counts.tuples > 0,
      proven: metrics.data_driven.score >= 0.85,
      evidence: ['source tuple corpus volume', sourceArtifacts.tuples],
      missing: [],
      proof_command: 'npm run atlas:source-tuples:apply && npm run atlas:ontology-kag:readiness',
    },
    {
      category: 'user_based',
      implementation: 'Use operator feedback, review flags, corrected summaries, and accepted/rejected recommendations.',
      created: true,
      wired: false,
      proven: false,
      evidence: ['readiness report identifies missing operator signal'],
      missing: ['operator feedback capture', 'accepted/rejected recommendation replay reward'],
      proof_command: 'npm run atlas:recommendations:replay',
    },
  ];
  return rows.map((row) => ({
    ...row,
    gan_status: ganStatus(row),
  }));
}

function main() {
  const candidates = readJsonl(CANDIDATES, LIMIT);
  const tuples = readJsonl(TUPLES);
  const turbovecProof = readJsonFile(TURBOVEC_PROOF);
  const total = candidates.length;

  const withPacket = candidates.filter((r) => hasText(r.packet_key)).length;
  const withSource = candidates.filter((r) => hasText(r.source_ref)).length;
  const withFeature = candidates.filter((r) => featureIdLooksCanonical(r.feature_id)).length;
  const withDomain = candidates.filter((r) => hasText(r.domain_class)).length;
  const withOntology = candidates.filter((r) => hasText(r.ontology_label)).length;
  const withTopology = candidates.filter((r) => hasText(r.topology_label) || hasText(r.relation_counts?.USES_NEO4J)).length;
  const withContext = candidates.filter((r) => hasText(r.content_ref) && fs.existsSync(path.resolve(REPO_ROOT, r.content_ref))).length;
  const withSymbols = candidates.filter((r) => Array.isArray(r.symbols) && r.symbols.length > 0).length;
  const withStructuralEdges = candidates.filter((r) => {
    const rel = r.relation_counts ?? {};
    return (rel.IMPORTS ?? 0) + (rel.EXPORTS ?? 0) + (rel.DEFINES ?? 0) + (rel.ROUTE_HANDLES ?? 0) > 0;
  }).length;
  const withKagReady = candidates.filter((r) => {
    const rel = r.relation_counts ?? {};
    return hasText(r.feature_id) && ((rel.MCP_TOOL ?? 0) + (rel.USES_VECTOR_SEARCH ?? 0) + (rel.USES_REDIS_CACHE ?? 0) + (rel.USES_POSTGRES ?? 0)) > 0;
  }).length;

  const lexicalGrams = topCounts(candidates, (row) => [
    ...trigrams(row.feature_label),
    ...trigrams(row.feature_id),
    ...(row.symbols ?? []).flatMap((s) => trigrams(s)).slice(0, 12),
  ], 30);
  const relationCounts = topCounts(tuples, (row) => row.relation, 30);
  const featureCounts = topCounts(candidates, (row) => row.feature_id, 30);
  const featureSize = new Map();
  const degreeByPacket = new Map();
  for (const candidate of candidates) {
    if (candidate.feature_id) featureSize.set(candidate.feature_id, (featureSize.get(candidate.feature_id) ?? 0) + 1);
    const rel = candidate.relation_counts ?? {};
    degreeByPacket.set(candidate.packet_key, Object.values(rel).reduce((sum, value) => sum + Number(value ?? 0), 0));
  }
  const graphStats = { featureSize, degreeByPacket };
  const perNodeValidation = candidates.map((row) => ({
    packet_key: row.packet_key,
    source_ref: row.source_ref,
    feature_id: row.feature_id,
    feature_label: row.feature_label,
    domain_class: row.domain_class ?? null,
    ontology_label: row.ontology_label ?? null,
    topology_label: row.topology_label ?? null,
    validation_score: validationVectorFor(row, graphStats),
  }));
  const vectorKeys = [
    'lexical', 'taxonomic', 'semantic', 'contextual', 'syntactic', 'structural',
    'completeness', 'consistency', 'coupling', 'modularity', 'connectivity', 'authority',
  ];
  const validationVector = Object.fromEntries(vectorKeys.map((key) => [
    key,
    Number(average(perNodeValidation.map((row) => row.validation_score[key])).toFixed(4)),
  ]));
  const validationDistribution = Object.fromEntries(vectorKeys.map((key) => {
    const values = perNodeValidation.map((row) => row.validation_score[key]);
    return [key, {
      p10: Number(quantile(values, 0.1).toFixed(4)),
      p50: Number(quantile(values, 0.5).toFixed(4)),
      p90: Number(quantile(values, 0.9).toFixed(4)),
    }];
  }));
  const lowValidationNodes = perNodeValidation
    .map((row) => ({
      ...row,
      average_score: Number(average(Object.values(row.validation_score)).toFixed(4)),
    }))
    .sort((a, b) => a.average_score - b.average_score)
    .slice(0, 50);

  const metrics = {
    lexical: {
      score: score(withSymbols, total),
      coverage_pct: pct(withSymbols, total),
      evidence: 'symbols/trigrams available for candidate rows',
    },
    taxonomic: {
      score: score(withFeature + withDomain, total * 2),
      coverage_pct: pct(withFeature + withDomain, total * 2),
      evidence: 'canonical feature_id plus domain_class coverage',
    },
    semantic: {
      score: turbovecProof?.gates?.pass
        ? 1
        : score(candidates.filter((r) => (r.scores?.semantic_score ?? 0) > 0).length, total),
      coverage_pct: turbovecProof?.gates?.pass
        ? 100
        : pct(candidates.filter((r) => (r.scores?.semantic_score ?? 0) > 0).length, total),
      evidence: turbovecProof?.gates?.pass
        ? 'TurboVec ANN gRPC proof passed over Qdrant vectors'
        : 'candidate semantic_score present from tuple-derived ranker',
    },
    context: {
      score: score(withContext, total),
      coverage_pct: pct(withContext, total),
      evidence: 'bounded packet context refs exist on disk',
    },
    syntactic: {
      score: score(withPacket + withSource + withFeature, total * 3),
      coverage_pct: pct(withPacket + withSource + withFeature, total * 3),
      evidence: 'packet_key/source_ref/feature_id contract fields',
    },
    structural: {
      score: score(withStructuralEdges, total),
      coverage_pct: pct(withStructuralEdges, total),
      evidence: 'IMPORTS/EXPORTS/DEFINES/ROUTE_HANDLES tuple coverage',
    },
    application: {
      score: score(withKagReady, total),
      coverage_pct: pct(withKagReady, total),
      evidence: 'KAG/ACE-ready rows with feature identity and runtime/retrieval relations',
    },
    data_driven: {
      score: score(tuples.length, Math.max(total, 1) * 10),
      coverage_pct: pct(Math.min(tuples.length, total * 10), total * 10),
      evidence: 'tuple corpus volume relative to candidate set',
    },
    user_based: {
      score: 0,
      coverage_pct: 0,
      evidence: 'operator acceptance/rejection signal not present in this artifact',
    },
  };

  const weakMetrics = Object.entries(metrics)
    .filter(([, value]) => value.score < 0.85)
    .sort((a, b) => a[1].score - b[1].score)
    .map(([metric, value]) => ({
      metric,
      score: value.score,
      coverage_pct: value.coverage_pct,
      evidence: value.evidence,
      mutation_attempts: mutationAttempts(metric, value.evidence),
    }));
  for (const [metric, value] of Object.entries(validationVector)) {
    if (value < 0.85 && !weakMetrics.some((item) => item.metric === metric)) {
      weakMetrics.push({
        metric,
        score: value,
        coverage_pct: Number((value * 100).toFixed(2)),
        evidence: `continuous validation vector average for ${metric}`,
        mutation_attempts: mutationAttempts(metric, `continuous validation vector average for ${metric}`),
      });
    }
  }
  weakMetrics.sort((a, b) => a.score - b.score);

  const report = {
    generated_at: new Date().toISOString(),
    status: weakMetrics.length ? 'WARN' : 'PASS',
    source_artifacts: {
      candidates: CANDIDATES,
      tuples: TUPLES,
    },
    counts: {
      candidates: total,
      tuples: tuples.length,
      with_packet_key: withPacket,
      with_source_ref: withSource,
      canonical_feature_id: withFeature,
      domain_class: withDomain,
      ontology_label: withOntology,
      topology_label_or_graph_relation: withTopology,
      bounded_context_refs: withContext,
      structural_edges: withStructuralEdges,
      kag_ready: withKagReady,
    },
    metrics,
    validation_score: validationVector,
    validation_distribution: validationDistribution,
    low_validation_nodes: lowValidationNodes,
    gan_proof_matrix: buildGanProofMatrix({
      metrics,
      validationVector,
      counts: {
        ...{
          candidates: total,
          tuples: tuples.length,
          with_packet_key: withPacket,
          with_source_ref: withSource,
          canonical_feature_id: withFeature,
          domain_class: withDomain,
          ontology_label: withOntology,
          topology_label_or_graph_relation: withTopology,
          bounded_context_refs: withContext,
          structural_edges: withStructuralEdges,
          kag_ready: withKagReady,
        },
      },
      sourceArtifacts: {
        candidates: CANDIDATES,
        tuples: TUPLES,
        turbovec_proof: TURBOVEC_PROOF,
      },
      acceleratorProof: turbovecProof,
    }),
    accelerator_proof: turbovecProof ? {
      status: turbovecProof.status,
      sidecar_dim: turbovecProof.sidecar_dim,
      http_indexed: turbovecProof.http_health_after?.indexed ?? 0,
      grpc_candidates: turbovecProof.grpc_search?.candidate_count ?? 0,
      backend: turbovecProof.grpc_health?.backend ?? null,
      gates: turbovecProof.gates ?? {},
      report: TURBOVEC_PROOF,
    } : {
      status: 'MISSING',
      report: TURBOVEC_PROOF,
    },
    lexical_trigram_top: lexicalGrams,
    top_relations: relationCounts,
    top_features: featureCounts,
    som_20x20_guidance: {
      status: 'DEFER_UNTIL_EMBEDDINGS_EXIST',
      cells: 400,
      input_order: ['EmbeddingGemma 768 summary/content vectors', 'optional latent_128/latent_64', 'kmeans precluster', 'SOM 20x20 labels'],
      rule: 'SOM, topology_label, ontology_label, and domain_class are enrichment metadata, not identity.',
    },
    kag_mutation_awareness: {
      status: 'READY_FOR_PROOF_QUEUE',
      rule: 'mutations are agentic workflow attempts, not canonical packet changes',
      weak_metrics: weakMetrics.map((x) => x.metric),
      routing_use: {
        maintenance_agent: 'prioritize low completeness, high coupling, low modularity, or low consistency',
        retrieval_agent: 'prioritize high authority, connectivity, lexical, and semantic scores',
        summarizer_agent: 'prioritize high structural/contextual evidence before Gemma4 summary generation',
      },
    },
    recommendations: weakMetrics,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');

  const lines = [];
  lines.push('# Ontology / KAG Readiness');
  lines.push('');
  lines.push(`Status: ${report.status}`);
  lines.push(`Candidates: ${total}`);
  lines.push(`Tuples: ${tuples.length}`);
  lines.push('');
  lines.push('## Metrics');
  lines.push('');
  lines.push('| Metric | Score | Coverage | Evidence |');
  lines.push('|---|---:|---:|---|');
  for (const [metric, value] of Object.entries(metrics)) {
    lines.push(`| ${metric} | ${value.score} | ${value.coverage_pct}% | ${value.evidence} |`);
  }
  lines.push('');
  lines.push('## Continuous Validation Vector');
  lines.push('');
  lines.push('| Metric | Average | P10 | P50 | P90 |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const key of vectorKeys) {
    const dist = validationDistribution[key];
    lines.push(`| ${key} | ${validationVector[key]} | ${dist.p10} | ${dist.p50} | ${dist.p90} |`);
  }
  lines.push('');
  lines.push('## Accelerator Proof');
  lines.push('');
  if (report.accelerator_proof.status === 'MISSING') {
    lines.push(`TurboVec ANN gRPC proof missing: \`${TURBOVEC_PROOF}\``);
  } else {
    lines.push(`Status: ${report.accelerator_proof.status}`);
    lines.push(`Backend: ${report.accelerator_proof.backend}`);
    lines.push(`HTTP indexed: ${report.accelerator_proof.http_indexed}`);
    lines.push(`gRPC candidates: ${report.accelerator_proof.grpc_candidates}`);
  }
  lines.push('');
  lines.push('## Agentic Mutation Attempts');
  lines.push('');
  lines.push('## GAN Proof Matrix');
  lines.push('');
  lines.push('| Category | GAN Status | Implementation | Missing | Proof command |');
  lines.push('|---|---|---|---|---|');
  for (const row of report.gan_proof_matrix) {
    lines.push(`| ${row.category} | ${row.gan_status} | ${row.implementation} | ${(row.missing ?? []).join('; ') || 'none'} | \`${row.proof_command}\` |`);
  }
  lines.push('');
  for (const item of weakMetrics) {
    lines.push(`### ${item.metric}`);
    for (const attempt of item.mutation_attempts) {
      lines.push(`${attempt.attempt}. ${attempt.action}`);
    }
    lines.push('');
  }
  lines.push('## SOM 20x20 Rule');
  lines.push('');
  lines.push('Run SOM after EmbeddingGemma vectors exist. SOM/domain/topology/ontology labels remain enrichment metadata, not identity.');
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n', 'utf8');

  console.log(JSON.stringify({
    status: report.status,
    candidates: total,
    tuples: tuples.length,
    weak_metrics: weakMetrics.map((x) => x.metric),
    out_json: OUT_JSON,
    out_md: OUT_MD,
  }, null, 2));
}

main();
