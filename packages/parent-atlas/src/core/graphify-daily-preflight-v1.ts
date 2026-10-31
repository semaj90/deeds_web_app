import { createHash } from 'node:crypto';
import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z.string().min(1);
const diagnosticStatus = z.enum(['AVAILABLE', 'DEGRADED', 'UNAVAILABLE']);

export const hostPreflightReceiptV1Schema = z.object({
  schema: z.literal('atlas.host-preflight.v1'),
  observedAtUtc: z.string().datetime(),
  host: z.object({
    status: diagnosticStatus,
    osVersion: z.string(),
    osCaption: z.string(),
    freeRamMiB: z.number().nonnegative(),
    cpu: z.array(z.object({
      name: z.string(),
      physicalCores: z.number().int().nonnegative(),
      logicalProcessors: z.number().int().nonnegative(),
      loadPercent: z.number().nullable(),
    }).strict()),
    disks: z.array(z.object({
      drive: z.string(),
      freeGiB: z.number().nonnegative(),
      totalGiB: z.number().nonnegative(),
    }).strict()),
    topProcesses: z.array(z.object({
      name: z.string(),
      cpuSeconds: z.number().nonnegative().nullable(),
      workingSetMiB: z.number().nonnegative(),
    }).strict()),
  }).strict(),
  gpu: z.object({ status: diagnosticStatus, output: z.array(z.string()) }).strict(),
  docker: z.object({
    containers: z.object({ status: diagnosticStatus, output: z.array(z.string()) }).strict(),
    stats: z.object({ status: diagnosticStatus, output: z.array(z.string()) }).strict(),
  }).strict(),
  wsl: z.object({
    runningDistributions: z.object({ status: diagnosticStatus, output: z.array(z.string()) }).strict(),
    configuredLimits: z.object({
      status: z.enum(['UNVERIFIED', 'CONFIGURED_ONLY_RUNTIME_NOT_VERIFIED']),
      source: z.string(),
      memory: z.string().nullable(),
      processors: z.string().nullable(),
      swap: z.string().nullable(),
    }).strict(),
    runtimeResourceUsage: z.object({ status: z.literal('UNVERIFIED'), reason: z.string().min(1) }).strict(),
  }).strict(),
  authority: z.literal('DIAGNOSTIC_ONLY_NO_ADMISSION_OR_EXECUTION_AUTHORITY'),
}).strict();

export type HostPreflightReceiptV1 = z.infer<typeof hostPreflightReceiptV1Schema>;

const gate = z.object({
  status: z.enum(['PASS', 'FAIL', 'UNVERIFIED']),
  evidenceRefs: z.array(ref),
  revision: z.string().min(1).nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'PASS' && value.evidenceRefs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceRefs'], message: 'a passing gate requires evidence references' });
  }
  if (value.status === 'PASS' && value.revision === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['revision'], message: 'a passing gate requires its verified revision' });
  }
});

export const graphifyDailyPreflightInputV1Schema = z.object({
  schema: z.literal('atlas.graphify-daily-preflight-input.v1').default('atlas.graphify-daily-preflight-input.v1'),
  workflowId: ref,
  runId: ref,
  workspaceRevision: gate,
  sourceRevision: gate,
  repositoryIdentity: gate,
  membershipAdmission: gate,
  scopePolicy: gate,
  executionAuthority: gate,
  graphSnapshotRevision: gate,
  topologyBindings: gate,
  astLineage: gate,
  packetChunkLineage: gate,
  schemaOwnership: gate,
  lexicalLane: gate,
  hostResources: gate,
  gpuResources: gate,
}).strict();

export type GraphifyDailyPreflightInputV1 = z.infer<typeof graphifyDailyPreflightInputV1Schema>;

export const graphifyDailyPreflightPlanV1Schema = z.object({
  schema: z.literal('atlas.graphify-daily-preflight-plan.v1'),
  workflowId: ref,
  runId: ref,
  graphProjection: z.enum(['ELIGIBLE_FOR_REVIEW', 'BLOCKED']),
  lexicalRetrieval: z.enum(['AVAILABLE', 'UNAVAILABLE', 'UNVERIFIED']),
  compute: z.enum(['AVAILABLE', 'DEGRADED', 'UNAVAILABLE', 'UNVERIFIED']),
  blockers: z.array(z.string()),
  gates: graphifyDailyPreflightInputV1Schema.omit({ workflowId: true, runId: true }),
  planSha256: digest,
}).strict();

export type GraphifyDailyPreflightPlanV1 = z.infer<typeof graphifyDailyPreflightPlanV1Schema>;

const diagnosticCapabilityDefinitionsV1 = [
  {
    id: 'host.preflight.read',
    owner: 'parent-atlas-host-diagnostics',
    executable: 'pwsh',
    args: ['-NoProfile', '-File', 'scripts/atlas/diagnostics/collect-host-preflight-v1.ps1'],
    runtime: 'PowerShell 7',
    workingDirectory: '.',
    executionIdentity: 'CURRENT_OS_USER_READ_ONLY',
    inputAuthority: 'LOCAL_HOST_AND_DAEMON_DIAGNOSTICS',
    requiredProofs: ['CAPABILITY_ID_ALLOWLISTED'],
    databaseAccess: 'NONE',
    mutationClass: 'READ_ONLY_DIAGNOSTIC',
    timeoutMs: 45_000,
    maxOutputBytes: 128_000,
    maxMemoryMiB: 256,
    networkAccess: 'LOCAL_DAEMON_STATUS_ONLY',
    approvalRequirement: 'NONE_READ_ONLY',
    outputContract: 'atlas.host-preflight.v1',
  },
  {
    id: 'workspace.revision.diagnostic',
    owner: 'git-worktree-diagnostics',
    executable: 'git',
    args: ['rev-parse', '--verify', 'HEAD'],
    runtime: 'Git CLI',
    workingDirectory: '.',
    executionIdentity: 'CURRENT_OS_USER_READ_ONLY',
    inputAuthority: 'LOCAL_WORKTREE_OBSERVATION_ONLY',
    requiredProofs: ['CAPABILITY_ID_ALLOWLISTED'],
    databaseAccess: 'NONE',
    mutationClass: 'READ_ONLY_DIAGNOSTIC',
    timeoutMs: 10_000,
    maxOutputBytes: 16_384,
    maxMemoryMiB: 64,
    networkAccess: 'NONE',
    approvalRequirement: 'NONE_READ_ONLY',
    outputContract: 'git-commit-hex-v1',
  },
  {
    id: 'graphify.daily.preflight',
    owner: 'parent-atlas-graphify-preflight',
    executable: 'node',
    args: ['scripts/atlas/graphify-daily-preflight-v1.mjs'],
    runtime: 'Node.js',
    workingDirectory: '.',
    executionIdentity: 'CURRENT_OS_USER_READ_ONLY',
    inputAuthority: 'LOCAL_READ_ONLY_DIAGNOSTICS_ONLY',
    requiredProofs: ['CAPABILITY_ID_ALLOWLISTED'],
    databaseAccess: 'NONE',
    mutationClass: 'READ_ONLY_DIAGNOSTIC',
    timeoutMs: 90_000,
    maxOutputBytes: 192_000,
    maxMemoryMiB: 384,
    networkAccess: 'LOCAL_DAEMON_STATUS_ONLY',
    approvalRequirement: 'NONE_READ_ONLY',
    outputContract: 'atlas.graphify-daily-preflight-plan.v1',
  },
  {
    id: 'graphify.snapshot.contract-tests',
    owner: 'parent-atlas-snapshot-contracts',
    executable: 'node',
    args: ['--test', 'packages/parent-atlas/test/graph-snapshot-v2.test.mjs', 'scripts/atlas/lib/stage5-pagerank-persistence-gate-v1.test.mjs'],
    runtime: 'Node.js',
    workingDirectory: '.',
    executionIdentity: 'CURRENT_OS_USER_READ_ONLY',
    inputAuthority: 'CHECKED_IN_TEST_FIXTURES_AND_SOURCE',
    requiredProofs: ['CAPABILITY_ID_ALLOWLISTED'],
    databaseAccess: 'NONE',
    mutationClass: 'READ_ONLY_TEST',
    timeoutMs: 120_000,
    maxOutputBytes: 256_000,
    maxMemoryMiB: 1024,
    networkAccess: 'NONE',
    approvalRequirement: 'NONE_READ_ONLY',
    outputContract: 'node-test-v1',
  },
  {
    id: 'graphify.scope.contract-tests',
    owner: 'parent-atlas-scope-contracts',
    executable: 'node',
    args: ['--test', 'scripts/atlas/lib/graphify-scope-repository-map-v1.test.mjs', 'scripts/atlas/lib/graphify-scope-admission-v1.test.mjs', 'scripts/atlas/lib/packet-key-v2-admission-v1.test.mjs'],
    runtime: 'Node.js',
    workingDirectory: '.',
    executionIdentity: 'CURRENT_OS_USER_READ_ONLY',
    inputAuthority: 'CHECKED_IN_TEST_FIXTURES_AND_SOURCE',
    requiredProofs: ['CAPABILITY_ID_ALLOWLISTED'],
    databaseAccess: 'NONE',
    mutationClass: 'READ_ONLY_TEST',
    timeoutMs: 120_000,
    maxOutputBytes: 256_000,
    maxMemoryMiB: 1024,
    networkAccess: 'NONE',
    approvalRequirement: 'NONE_READ_ONLY',
    outputContract: 'node-test-v1',
  },
] as const;

export const ATLAS_DIAGNOSTIC_CAPABILITIES_V1 = Object.freeze(
  diagnosticCapabilityDefinitionsV1.map((capability) => Object.freeze({
    ...capability,
    args: Object.freeze([...capability.args]),
    requiredProofs: Object.freeze([...capability.requiredProofs]),
  })),
);

export type AtlasDiagnosticCapabilityIdV1 = typeof ATLAS_DIAGNOSTIC_CAPABILITIES_V1[number]['id'];

export function resolveAtlasDiagnosticCapabilityV1(
  id: AtlasDiagnosticCapabilityIdV1,
  requestedArgs?: readonly string[],
) {
  const capability = ATLAS_DIAGNOSTIC_CAPABILITIES_V1.find((candidate) => candidate.id === id);
  if (!capability) throw new Error(`ATLAS_CAPABILITY_UNKNOWN:${String(id)}`);
  if (requestedArgs && (requestedArgs.length !== capability.args.length || requestedArgs.some((arg, index) => arg !== capability.args[index]))) {
    throw new Error(`ATLAS_CAPABILITY_ARGUMENTS_MISMATCH:${id}`);
  }
  return { ...capability, args: [...capability.args] };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const GRAPH_GATES = [
  'workspaceRevision',
  'sourceRevision',
  'repositoryIdentity',
  'membershipAdmission',
  'scopePolicy',
  'executionAuthority',
  'graphSnapshotRevision',
  'topologyBindings',
  'astLineage',
  'packetChunkLineage',
  'schemaOwnership',
] as const;

export function buildGraphifyDailyPreflightPlanV1(input: GraphifyDailyPreflightInputV1): GraphifyDailyPreflightPlanV1 {
  const parsed = graphifyDailyPreflightInputV1Schema.parse(input);
  const blockers = GRAPH_GATES.flatMap((name) => {
    const result = parsed[name];
    return result.status === 'PASS' ? [] : [`${name}:${result.status}`];
  });
  const resourceStatus = parsed.hostResources.status === 'FAIL' || parsed.gpuResources.status === 'FAIL'
    ? 'UNAVAILABLE'
    : parsed.hostResources.status === 'UNVERIFIED' || parsed.gpuResources.status === 'UNVERIFIED'
      ? 'UNVERIFIED'
      : parsed.hostResources.status === 'PASS' && parsed.gpuResources.status === 'PASS'
        ? 'AVAILABLE'
        : 'DEGRADED';
  const body = {
    schema: 'atlas.graphify-daily-preflight-plan.v1' as const,
    workflowId: parsed.workflowId,
    runId: parsed.runId,
    graphProjection: blockers.length === 0 ? 'ELIGIBLE_FOR_REVIEW' as const : 'BLOCKED' as const,
    lexicalRetrieval: parsed.lexicalLane.status === 'PASS' ? 'AVAILABLE' as const
      : parsed.lexicalLane.status === 'FAIL' ? 'UNAVAILABLE' as const : 'UNVERIFIED' as const,
    compute: resourceStatus,
    blockers,
    gates: Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== 'schema' && key !== 'workflowId' && key !== 'runId')),
  };
  const planSha256 = createHash('sha256').update(stableJson(body), 'utf8').digest('hex');
  return graphifyDailyPreflightPlanV1Schema.parse({ ...body, planSha256 });
}
