import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CENSUS_PATH = process.env.OPENSPEC_CENSUS_PATH
  ? path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-portfolio-census-v2.json');
const CENSUS_REF = path.relative(ROOT, CENSUS_PATH).replaceAll('\\', '/');
const OUTPUT_PATH = process.env.OPENSPEC_DEPENDENCY_GRAPH_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_DEPENDENCY_GRAPH_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-dependency-graph-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

export function buildOpenSpecDependencyGraphV1(census) {
  if (census?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  const nodes = (census.tasks ?? []).map((task) => ({
    nodeId: task.canonicalTaskRef,
    taskRef: task.taskRef,
    changeId: task.changeId,
    authorityScope: task.authorityScope,
    taskId: task.taskId ?? null,
    taskIdStatus: task.taskIdStatus,
    identityState: task.taskIdentity?.identityState ?? null,
    declaredChecked: task.declaredChecked,
    archived: task.archived,
    sourceRef: task.taskRef,
    claimHash: task.taskIdentity?.normalizedClaimHash ?? null,
  })).sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const edges = (census.dependencies ?? []).map((edge) => ({
    from: edge.from,
    to: edge.to,
    relation: edge.relation,
    sourceRef: edge.sourceRef,
    parser: edge.parser,
  })).sort((left, right) => `${left.from}\0${left.to}\0${left.relation}`.localeCompare(`${right.from}\0${right.to}\0${right.relation}`));
  const unresolvedEdges = [
    ...(census.missingTaskReferences ?? []),
    ...(census.changeLevelReferences ?? []),
  ].map((edge) => ({
    from: edge.fromTaskKey,
    reference: edge.reference,
    relation: edge.relation,
    sourceRef: edge.taskRef,
    status: edge.status,
    detail: edge.detail,
  }));
  const aliases = (census.duplicateTaskIdGroups ?? [])
    .filter((group) => ['ARCHIVE_DUPLICATE', 'MIRROR_DUPLICATE', 'NAMESPACE_COLLISION', 'DUPLICATE_DERIVED_KEY', 'DUPLICATE_DECLARED_ID_SAME_CHANGE', 'DUPLICATE_DECLARED_ID_CROSS_CHANGE'].includes(group.classification))
    .map((group) => ({
      classification: group.classification,
      taskRefs: group.taskRefs,
      canonicalTaskRefs: group.canonicalTaskRefs,
      authorityScopes: group.authorityScopes,
      changeIds: group.changeIds,
    }));
  const unsigned = {
    schema: 'atlas.openspec-dependency-graph.v1',
    generatedAt: new Date().toISOString(),
    source: {
      census: CENSUS_REF,
      workspaceRevision: census.source?.workspaceRevision ?? null,
      taskAuthority: census.source?.taskAuthority ?? 'openspec/changes/*/tasks.md',
      identityAuthority: 'scripts/atlas/audit-openspec-evidence-fabric-v1.mjs',
      canonicalAuthority: false,
    },
    nodes,
    edges,
    unresolvedEdges,
    aliases,
    supersessionCandidates: census.supersession?.candidates ?? [],
    cycles: census.dependencyCycles ?? [],
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      unresolvedEdgeCount: unresolvedEdges.length,
      aliasGroupCount: aliases.length,
      supersessionCandidateCount: (census.supersession?.candidates ?? []).length,
      cycleCount: (census.dependencyCycles ?? []).length,
      cycleAffectedTaskCount: census.summary?.dependencyCycleAffectedTaskCount ?? null,
    },
    invariants: [
      'Canonical task identity is derived from the OpenSpec authority scope, change, and stable task identity.',
      'Unresolved, ambiguous, alias, archive, and supersession relationships never become proof or authorization.',
      'This graph is a rebuildable projection; PostgreSQL remains the future canonical ledger authority.',
    ],
    sideEffects: { taskLedgersMutated: false, persistentStoresMutated: false },
    likely_cause: 'Task identity and dependency observations existed in the census but had no bounded graph artifact for deterministic reconciliation.',
    evidence: [CENSUS_REF, 'census.source.workspaceRevision', 'census.duplicateTaskIdGroups', 'census.dependencyCycles'],
    patch_targets: ['scripts/atlas/build-openspec-dependency-graph-v1.mjs'],
    safe_next_command: 'node scripts/atlas/build-openspec-dependency-graph-v1.mjs',
    smoke_command: 'node --check scripts/atlas/build-openspec-dependency-graph-v1.mjs',
    report_path: 'docs/reports/openspec-dependency-graph-v1.json',
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8'));
  const graph = buildOpenSpecDependencyGraphV1(census);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: graph.schema, summary: graph.summary, workspaceRevision: graph.source.workspaceRevision, checksum: graph.checksum, output: OUTPUT_PATH }, null, 2));
}
