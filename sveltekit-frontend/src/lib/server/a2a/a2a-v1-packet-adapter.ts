import type { CanonicalPacketTransportV1 } from '$lib/server/atlas/transport/canonical-packet-transport.js';

export interface A2AAgentInterfaceV1 {
  url: string;
  protocolBinding: string;
  protocolVersion: string;
  tenant?: string;
}

export interface A2ASkillV1 {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface A2AAgentCardV1 {
  name: string;
  description: string;
  version: string;
  supportedInterfaces: A2AAgentInterfaceV1[];
  capabilities?: Record<string, unknown>;
  skills: A2ASkillV1[];
}

export type A2APartV1 =
  | { text: string; mediaType?: string; metadata?: Record<string, unknown> }
  | { raw: string; mediaType: string; metadata?: Record<string, unknown> }
  | { url: string; mediaType?: string; metadata?: Record<string, unknown> }
  | { data: Record<string, unknown>; mediaType?: string; metadata?: Record<string, unknown> };

export interface A2AArtifactV1 {
  artifactId: string;
  name?: string;
  description?: string;
  parts: A2APartV1[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
}

/**
 * Build a current A2A v1-style AgentCard projection for Parent Atlas.
 * This is a transport/discovery descriptor only; ACP/MCP tool authorization and
 * canonical workflow state remain owned by Atlas.
 */
export function buildParentAtlasA2AAgentCardV1(input: {
  baseUrl: string;
  version: string;
  protocolVersion?: string;
}): A2AAgentCardV1 {
  const base = input.baseUrl.replace(/\/$/, '');
  return {
    name: 'Parent Atlas',
    description: 'Revisioned retrieval, evidence, graph traversal, and bounded agent execution.',
    version: input.version,
    supportedInterfaces: [
      {
        url: `${base}/a2a`,
        protocolBinding: 'JSONRPC',
        protocolVersion: input.protocolVersion ?? '1.0',
      },
    ],
    capabilities: {
      streaming: true,
      extendedAgentCard: false,
    },
    skills: [
      {
        id: 'atlas.retrieve_evidence',
        name: 'Retrieve Evidence',
        description: 'Retrieve revision-qualified Parent Atlas evidence across canonical retrieval lanes.',
        tags: ['retrieval', 'semantic', 'ast', 'graph'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'atlas.packet_hydrate',
        name: 'Hydrate Packet',
        description: 'Hydrate a canonical packet reference and its evidence/object-storage references.',
        tags: ['packet', 'evidence', 'object-storage'],
        inputModes: ['application/json'],
        outputModes: ['application/json', 'application/msgpack'],
      },
      {
        id: 'atlas.graph_expand',
        name: 'Bounded Graph Expand',
        description: 'Expand a revision-bounded structural/n-ary graph frontier under an explicit budget.',
        tags: ['graph', 'hypergraph', 'bounded'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
    ],
  };
}

/**
 * Project one canonical packet transport envelope into an A2A Artifact.
 * Prefer references for large binary payloads rather than copying bytes into A2A.
 */
export function packetTransportToA2AArtifact(
  transport: CanonicalPacketTransportV1,
  opts: { hydrateUrl?: string } = {},
): A2AArtifactV1 {
  const metadata = {
    schema: transport.schema,
    packetKey: transport.packetKey,
    sourceRef: transport.sourceRef,
    canonicalId: transport.canonicalId,
    workspaceRevision: transport.workspaceRevision,
    sourceRevision: transport.sourceRevision,
    representationRevision: transport.representationRevision,
    featureRevision: transport.featureRevision,
    graphRevision: transport.graphRevision,
    ontologyRevision: transport.ontologyRevision,
    evidenceRefs: transport.evidenceRefs,
    ontologyIds: transport.ontologyIds,
    conceptIds: transport.conceptIds,
    hyperedgeRefs: transport.hyperedgeRefs,
    transportChecksum: transport.checksum,
  };

  let part: A2APartV1;
  if (transport.payload.mode === 'JSON_INLINE' && transport.payload.inlineJson) {
    part = {
      data: transport.payload.inlineJson,
      mediaType: transport.payload.mediaType,
      metadata,
    };
  } else if (transport.payload.mode === 'MSGPACK_INLINE' && transport.payload.inlineBytesBase64) {
    part = {
      raw: transport.payload.inlineBytesBase64,
      mediaType: transport.payload.mediaType,
      metadata: { ...metadata, contentEncoding: 'base64' },
    };
  } else if (opts.hydrateUrl) {
    const url = new URL(opts.hydrateUrl);
    url.searchParams.set('packetKey', transport.packetKey);
    url.searchParams.set('workspaceRevision', transport.workspaceRevision);
    part = { url: url.toString(), mediaType: transport.payload.mediaType, metadata };
  } else {
    part = {
      data: {
        packetKey: transport.packetKey,
        dataRefId: transport.payload.dataRefId ?? null,
        contentChecksum: transport.payload.contentChecksum,
      },
      mediaType: 'application/vnd.parent-atlas.packet-ref+json',
      metadata,
    };
  }

  return {
    artifactId: transport.transportId,
    name: `Parent Atlas packet ${transport.packetKey}`,
    description: 'Revision-qualified Parent Atlas packet/evidence transport projection.',
    parts: [part],
    metadata,
  };
}
