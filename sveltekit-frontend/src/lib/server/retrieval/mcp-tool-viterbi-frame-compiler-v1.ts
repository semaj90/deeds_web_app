import type { McpToolViterbiFrameV2 } from './mcp-tool-viterbi-bridge-v1.js';
import type { MCPToolRefV1 } from './mcp-tool-registry-types-v1.js';

export type ToolRoutingPhaseV1 = 'DISCOVER' | 'INSPECT' | 'EXPAND' | 'VALIDATE' | 'SYNTHESIZE';

export type ToolRoutingObservationV1 = {
  revision: string;
  workspaceRevision: string;
  producerRevision: string;
  policyRevision: string;
  taxonomyRevision: string;
  evidenceChecksum: string;
  phase: ToolRoutingPhaseV1;
  intent: string;
  domain: string;
  evidenceState: 'MISSING' | 'PARTIAL' | 'SUFFICIENT';
  preferredCapabilities: readonly string[];
};

export type ToolRouteProfileV1 = {
  ref: MCPToolRefV1;
  toolSchemaDigest: string;
  domains: readonly string[];
  intents: readonly string[];
  capabilities: readonly string[];
  phases: readonly ToolRoutingPhaseV1[];
  readOnly: boolean;
  successRate: number;
  latencyScore: number;
  costScore: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function overlapScore(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rhs = new Set(right.map((value) => value.toLowerCase()));
  const matched = left.filter((value) => rhs.has(value.toLowerCase())).length;
  return matched / Math.max(1, left.length);
}

export function scoreMcpToolForRoutingV1(
  observation: ToolRoutingObservationV1,
  profile: ToolRouteProfileV1,
): number {
  if (!profile.readOnly) return Number.NEGATIVE_INFINITY;
  if (!profile.phases.includes(observation.phase)) return Number.NEGATIVE_INFINITY;

  const domainMatch = profile.domains.some((value) => value.toLowerCase() === observation.domain.toLowerCase()) ? 1 : 0;
  const intentMatch = profile.intents.some((value) => value.toLowerCase() === observation.intent.toLowerCase()) ? 1 : 0;
  const capabilityMatch = overlapScore(observation.preferredCapabilities, profile.capabilities);
  const evidenceBias =
    observation.evidenceState === 'MISSING' ? (observation.phase === 'DISCOVER' || observation.phase === 'INSPECT' ? 1 : 0.25) :
    observation.evidenceState === 'PARTIAL' ? (observation.phase === 'EXPAND' || observation.phase === 'VALIDATE' ? 0.8 : 0.5) :
    observation.phase === 'VALIDATE' || observation.phase === 'SYNTHESIZE' ? 1 : 0.4;

  return Number((
    0.24 * domainMatch +
    0.24 * intentMatch +
    0.2 * capabilityMatch +
    0.12 * clamp01(profile.successRate) +
    0.08 * clamp01(profile.latencyScore) +
    0.04 * clamp01(profile.costScore) +
    0.08 * evidenceBias
  ).toFixed(8));
}

/**
 * Compile Viterbi frames from revision-qualified routing observations and an
 * already-admitted MCP tool registry projection.
 *
 * No DB/vector/graph lookup occurs here. Tool identity, permissions and schema
 * digests must already be supplied by the registry owner.
 */
export function buildMcpToolViterbiFramesV1(input: {
  observations: readonly ToolRoutingObservationV1[];
  profiles: readonly ToolRouteProfileV1[];
  maxCandidatesPerFrame?: number;
}): McpToolViterbiFrameV2[] {
  const maxCandidates = Math.max(1, Math.min(32, Math.trunc(input.maxCandidatesPerFrame ?? 8)));
  if (input.observations.length === 0) return [];

  const profileKeys = new Set<string>();
  for (const profile of input.profiles) {
    const key = `${profile.ref.serverAuthorityId}::${profile.ref.toolName}`;
    if (profileKeys.has(key)) throw new Error(`DUPLICATE_TOOL_ROUTE_PROFILE:${key}`);
    profileKeys.add(key);
    if (!profile.toolSchemaDigest.trim()) throw new Error(`MISSING_TOOL_SCHEMA_DIGEST:${key}`);
  }

  return input.observations.map((observation) => {
    if (!observation.revision.trim()) throw new Error('TOOL_ROUTING_OBSERVATION_REVISION_REQUIRED');
    if (!observation.workspaceRevision.trim()) throw new Error('TOOL_ROUTING_WORKSPACE_REVISION_REQUIRED');
    if (!observation.producerRevision.trim()) throw new Error('TOOL_ROUTING_PRODUCER_REVISION_REQUIRED');
    if (!observation.policyRevision.trim()) throw new Error('TOOL_ROUTING_POLICY_REVISION_REQUIRED');
    if (!observation.taxonomyRevision.trim()) throw new Error('TOOL_ROUTING_TAXONOMY_REVISION_REQUIRED');
    if (!/^sha256:[a-f0-9]{64}$/.test(observation.evidenceChecksum)) {
      throw new Error('TOOL_ROUTING_EVIDENCE_CHECKSUM_INVALID');
    }

    const candidates = input.profiles
      .map((profile) => ({
        profile,
        score: scoreMcpToolForRoutingV1(observation, profile),
      }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((left, right) =>
        right.score - left.score ||
        left.profile.ref.serverAuthorityId.localeCompare(right.profile.ref.serverAuthorityId) ||
        left.profile.ref.toolName.localeCompare(right.profile.ref.toolName),
      )
      .slice(0, maxCandidates)
      .map(({ profile, score }) => ({
        id: `${profile.ref.serverAuthorityId}::${profile.ref.toolName}`,
        value: { ref: profile.ref, toolSchemaDigest: profile.toolSchemaDigest },
        emissionScore: score,
      }));

    if (candidates.length === 0) {
      throw new Error(`NO_ELIGIBLE_TOOL_CANDIDATES:${observation.phase}`);
    }

    return {
      revision: observation.revision,
      candidates,
    };
  });
}
