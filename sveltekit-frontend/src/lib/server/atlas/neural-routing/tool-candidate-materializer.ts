import type { ToolCandidateSignalV1, RetrievalSignalVectorV1 } from './contracts.js';
import {
  ATLAS_TOOL_IMPLEMENTATION_PROFILES,
  canonicalizeAtlasToolId,
  isImplementationRoutable,
  type ToolImplementationProfileV1,
} from './tool-implementation-profile.js';

export interface ToolEligibilityContextV1 {
  fsmAllowedTools: readonly string[];
  grantedPermissions: readonly string[];
  satisfiedPreconditions: readonly string[];
  modeByTool?: Readonly<Record<string, string | undefined>>;
}

export interface ToolBootstrapSignalsV1 {
  signals?: Partial<RetrievalSignalVectorV1>;
  intentProbability?: number;
  domainProbability?: number;
  capabilityMatch?: number;
  hammingMaskMatch?: number;
  evidenceCoverage?: number;
  revisionFreshness?: number;
  estimatedLatencyMs?: number;
  estimatedVramBytes?: number;
  evidenceRefs?: string[];
}

const ZERO_SIGNALS: RetrievalSignalVectorV1 = {
  lexicalExact: 0,
  lexicalSparse: 0,
  semantic: 0,
  ast: 0,
  graph: 0,
  hyperedge: 0,
};

function clamp01(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value!));
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function fsmCanonicalSet(toolIds: readonly string[]): Set<string> {
  return new Set(toolIds.map(canonicalizeAtlasToolId));
}

export function evaluateToolHardEligibility(input: {
  profile: ToolImplementationProfileV1;
  context: ToolEligibilityContextV1;
  mode?: string;
}): { eligible: boolean; reasonCodes: string[] } {
  const reasons: string[] = [];
  const fsmAllowed = fsmCanonicalSet(input.context.fsmAllowedTools);
  if (!fsmAllowed.has(input.profile.toolId)) reasons.push('FSM_TOOL_NOT_ALLOWED');

  const permissions = new Set(input.context.grantedPermissions);
  for (const permission of input.profile.requiredPermissions) {
    if (!permissions.has(permission)) reasons.push(`MISSING_PERMISSION:${permission}`);
  }

  const satisfied = new Set(input.context.satisfiedPreconditions);
  for (const precondition of input.profile.preconditions) {
    if (!satisfied.has(precondition)) reasons.push(`PRECONDITION_UNSATISFIED:${precondition}`);
  }

  const implementation = isImplementationRoutable({ profile: input.profile, mode: input.mode });
  if (!implementation.eligible) reasons.push(...implementation.reasonCodes);

  return { eligible: reasons.length === 0, reasonCodes: sortedUnique(reasons) };
}

export function materializeToolCandidates(input: {
  context: ToolEligibilityContextV1;
  bootstrapSignals?: Readonly<Record<string, ToolBootstrapSignalsV1>>;
}): ToolCandidateSignalV1[] {
  return Object.values(ATLAS_TOOL_IMPLEMENTATION_PROFILES)
    .map((profile) => {
      const mode = input.context.modeByTool?.[profile.toolId];
      const hard = evaluateToolHardEligibility({ profile, context: input.context, mode });
      const bootstrap = input.bootstrapSignals?.[profile.toolId] ?? {};
      const signals = { ...ZERO_SIGNALS, ...(bootstrap.signals ?? {}) };

      return {
        toolId: profile.toolId,
        eligible: hard.eligible,
        exclusionReasonCodes: hard.eligible ? [] : hard.reasonCodes,
        signals: {
          lexicalExact: clamp01(signals.lexicalExact),
          lexicalSparse: clamp01(signals.lexicalSparse),
          semantic: clamp01(signals.semantic),
          ast: clamp01(signals.ast),
          graph: clamp01(signals.graph),
          hyperedge: clamp01(signals.hyperedge),
        },
        intentProbability: clamp01(bootstrap.intentProbability),
        domainProbability: clamp01(bootstrap.domainProbability),
        capabilityMatch: clamp01(bootstrap.capabilityMatch),
        hammingMaskMatch: clamp01(bootstrap.hammingMaskMatch),
        // Deliberately unknown-at-bootstrap. Do not manufacture adaptive history.
        historicalSuccessRate: 0,
        historicalFailureRate: 0,
        evidenceCoverage: clamp01(bootstrap.evidenceCoverage),
        revisionFreshness: clamp01(bootstrap.revisionFreshness),
        estimatedLatencyMs: Math.max(0, bootstrap.estimatedLatencyMs ?? 0),
        estimatedVramBytes: Math.max(0, Math.floor(bootstrap.estimatedVramBytes ?? 0)),
        requiresWrite: profile.requiredPermissions.includes('code:write'),
        requiresApproval: profile.humanApprovalRequired,
        evidenceRefs: sortedUnique([
          ...(bootstrap.evidenceRefs ?? []),
          `implementation:${profile.backendRevision}`,
          ...(mode ? [`mode:${mode}`] : []),
        ]),
      } satisfies ToolCandidateSignalV1;
    })
    .sort((a, b) => a.toolId.localeCompare(b.toolId));
}
