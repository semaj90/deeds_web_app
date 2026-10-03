import { createHash } from 'node:crypto';
import { VECTOR_MANIFESTS } from '../../packages/semantic-contracts/src/vector-manifest.js';
import {
  NESTED_LATENT_REPRESENTATION_FAMILY_V1,
} from '../../sveltekit-frontend/src/lib/server/atlas/tensors/representation-artifact-v1.js';
import {
  RepresentationFamilyV1Schema,
} from '../../sveltekit-frontend/src/lib/server/atlas/representations/representation-gradient-v1.js';

type RepresentationNodeV1 = {
  nodeKey: string;
  lineageId: string;
  representationId: string;
  representationFamily: 'SEMANTIC_EMBEDDING' | 'AUTOENCODER_LATENT';
  dimensions: number;
  parentNodeKey: string | null;
  parentRepresentationId: string | null;
  derivation: 'ROOT' | 'MRL_PREFIX_L2_RENORMALIZE' | 'LEARNED' | 'NESTED_PREFIX_L2_RENORMALIZE';
  status: 'ACTIVE' | 'REFERENCE_ONLY' | 'UNTRAINED_CANDIDATE';
  owner: string;
};

export type RepresentationDerivationDagV1 = {
  schema: 'atlas.representation-derivation-dag.v1';
  nodes: RepresentationNodeV1[];
  artifactClasses: Array<{
    classId: string;
    status: 'PRESENT' | 'OWNER_NOT_FOUND';
    owner: string | null;
    canonicalAuthority: false;
  }>;
  independentAxes: {
    evidenceDepth: string;
    residencyTier: string;
    modelExecutionState: string;
  };
  unresolvedConflicts: Array<{
    representationId: string;
    lineageIds: string[];
    disposition: 'LINEAGE_QUALIFICATION_REQUIRED';
  }>;
  checksum: string;
  canonicalAuthority: false;
};

const VECTOR_MANIFEST_OWNER = 'packages/semantic-contracts/src/vector-manifest.ts';
const AE_FAMILY_OWNER = 'sveltekit-frontend/src/lib/server/atlas/tensors/representation-artifact-v1.ts';
const REPRESENTATION_GRADIENT_OWNER = 'sveltekit-frontend/src/lib/server/atlas/representations/representation-gradient-v1.ts';

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function nodeKey(lineageId: string, representationId: string): string {
  return `${lineageId}/${representationId}`;
}

function sortNodes(nodes: RepresentationNodeV1[]): RepresentationNodeV1[] {
  return nodes.sort((left, right) => left.nodeKey.localeCompare(right.nodeKey));
}

export function buildRepresentationDerivationDagV1(): RepresentationDerivationDagV1 {
  const nodes: RepresentationNodeV1[] = [];
  const semanticRootKey = nodeKey('semantic-canonical', 'semantic_768');
  nodes.push({
    nodeKey: semanticRootKey,
    lineageId: 'semantic-canonical',
    representationId: 'semantic_768',
    representationFamily: 'SEMANTIC_EMBEDDING',
    dimensions: VECTOR_MANIFESTS.semantic768.dimensions,
    parentNodeKey: null,
    parentRepresentationId: null,
    derivation: 'ROOT',
    status: VECTOR_MANIFESTS.semantic768.status,
    owner: VECTOR_MANIFEST_OWNER,
  });

  for (const manifest of Object.values(VECTOR_MANIFESTS)) {
    if (!manifest.vectorName.startsWith('semantic_mrl_')) continue;
    const storage = 'storage' in manifest ? manifest.storage : undefined;
    const parent = storage?.kind === 'DERIVED' ? storage.derivedFrom : null;
    nodes.push({
      nodeKey: nodeKey('semantic-mrl', manifest.vectorName),
      lineageId: 'semantic-mrl',
      representationId: manifest.vectorName,
      representationFamily: 'SEMANTIC_EMBEDDING',
      dimensions: manifest.dimensions,
      parentNodeKey: parent ? nodeKey('semantic-canonical', parent) : null,
      parentRepresentationId: parent ?? null,
      derivation: storage?.kind === 'DERIVED'
        && storage.derivation === 'MRL_PREFIX_L2_RENORMALIZE'
        ? 'MRL_PREFIX_L2_RENORMALIZE'
        : 'ROOT',
      status: manifest.status,
      owner: VECTOR_MANIFEST_OWNER,
    });
  }

  for (const representationId of ['latent_256', 'latent_128', 'latent_64'] as const) {
    const manifest = Object.values(VECTOR_MANIFESTS).find((candidate) => candidate.vectorName === representationId);
    if (!manifest) throw new Error(`HISTORICAL_LATENT_MANIFEST_MISSING:${representationId}`);
    const storage = 'storage' in manifest ? manifest.storage : undefined;
    const derivedFrom = storage?.kind === 'DERIVED' ? storage.derivedFrom : null;
    nodes.push({
      nodeKey: nodeKey('historical-v3', representationId),
      lineageId: 'historical-v3',
      representationId,
      representationFamily: 'AUTOENCODER_LATENT',
      dimensions: manifest.dimensions,
      parentNodeKey: derivedFrom ? nodeKey('historical-v3', derivedFrom) : semanticRootKey,
      parentRepresentationId: derivedFrom ?? 'semantic_768',
      derivation: derivedFrom
        ? 'NESTED_PREFIX_L2_RENORMALIZE'
        : 'LEARNED',
      status: manifest.status,
      owner: VECTOR_MANIFEST_OWNER,
    });
  }

  for (const [representationId, member] of Object.entries(
    NESTED_LATENT_REPRESENTATION_FAMILY_V1.members,
  )) {
    nodes.push({
      nodeKey: nodeKey('ae-candidate', representationId),
      lineageId: 'ae-candidate',
      representationId,
      representationFamily: 'AUTOENCODER_LATENT',
      dimensions: member.dimensions,
      parentNodeKey: member.parentRepresentationId
        ? nodeKey('ae-candidate', member.parentRepresentationId)
        : semanticRootKey,
      parentRepresentationId: member.parentRepresentationId ?? 'semantic_768',
      derivation: member.origin === 'DERIVED' ? 'NESTED_PREFIX_L2_RENORMALIZE' : 'LEARNED',
      status: 'UNTRAINED_CANDIDATE',
      owner: AE_FAMILY_OWNER,
    });
  }

  const sorted = sortNodes(nodes);
  assertRepresentationDerivationDagV1(sorted);
  const representationFamilies = RepresentationFamilyV1Schema.options;
  const artifactClasses: RepresentationDerivationDagV1['artifactClasses'] = [
    {
      classId: 'DETERMINISTIC_PROJECTION',
      status: representationFamilies.includes('LINEAR_PROJECTION') ? 'PRESENT' : 'OWNER_NOT_FOUND',
      owner: representationFamilies.includes('LINEAR_PROJECTION') ? REPRESENTATION_GRADIENT_OWNER : null,
      canonicalAuthority: false,
    },
    {
      classId: 'CLUSTER_ASSIGNMENT',
      status: representationFamilies.includes('CLUSTER_ASSIGNMENT') ? 'PRESENT' : 'OWNER_NOT_FOUND',
      owner: representationFamilies.includes('CLUSTER_ASSIGNMENT') ? REPRESENTATION_GRADIENT_OWNER : null,
      canonicalAuthority: false,
    },
    {
      classId: 'TOPOLOGY_COORDINATE',
      status: representationFamilies.includes('TOPOLOGY_COORDINATE') ? 'PRESENT' : 'OWNER_NOT_FOUND',
      owner: representationFamilies.includes('TOPOLOGY_COORDINATE') ? REPRESENTATION_GRADIENT_OWNER : null,
      canonicalAuthority: false,
    },
    {
      classId: 'KMEANS_ASSIGNMENT',
      status: 'OWNER_NOT_FOUND',
      owner: null,
      canonicalAuthority: false,
    },
  ];

  const duplicateIds = new Map<string, Set<string>>();
  for (const node of sorted) {
    const lineages = duplicateIds.get(node.representationId) ?? new Set<string>();
    lineages.add(node.lineageId);
    duplicateIds.set(node.representationId, lineages);
  }
  const unresolvedConflicts = [...duplicateIds.entries()]
    .filter(([, lineages]) => lineages.size > 1)
    .map(([representationId, lineages]) => ({
      representationId,
      lineageIds: [...lineages].sort(),
      disposition: 'LINEAGE_QUALIFICATION_REQUIRED' as const,
    }))
    .sort((left, right) => left.representationId.localeCompare(right.representationId));

  const body = {
    schema: 'atlas.representation-derivation-dag.v1' as const,
    nodes: sorted,
    artifactClasses,
    independentAxes: {
      evidenceDepth: 'sveltekit-frontend/src/lib/server/atlas/context/evidence-depth-v1.ts',
      residencyTier: 'sveltekit-frontend/src/lib/server/atlas/policy/ace-residency.ts',
      modelExecutionState: 'sveltekit-frontend/src/lib/server/atlas/pass-checkpoint-v1.ts',
    },
    unresolvedConflicts,
    canonicalAuthority: false as const,
  };
  return { ...body, checksum: sha256(JSON.stringify(body)) };
}

export function assertRepresentationDerivationDagV1(nodes: readonly RepresentationNodeV1[]): void {
  const byKey = new Map<string, RepresentationNodeV1>();
  for (const node of nodes) {
    if (byKey.has(node.nodeKey)) throw new Error(`DUPLICATE_DAG_NODE:${node.nodeKey}`);
    if (node.nodeKey !== nodeKey(node.lineageId, node.representationId)) {
      throw new Error(`DAG_NODE_KEY_MISMATCH:${node.nodeKey}`);
    }
    byKey.set(node.nodeKey, node);
  }

  for (const node of nodes) {
    if (node.parentNodeKey === null) {
      if (node.parentRepresentationId !== null) throw new Error(`DAG_PARENT_KEY_MISSING:${node.nodeKey}`);
      continue;
    }
    const parent = byKey.get(node.parentNodeKey);
    if (!parent) throw new Error(`DAG_PARENT_MISSING:${node.nodeKey}`);
    if (parent.representationId !== node.parentRepresentationId) {
      throw new Error(`DAG_PARENT_ID_MISMATCH:${node.nodeKey}`);
    }
    const semanticRootEdge = parent.representationId === 'semantic_768'
      && node.representationFamily === 'AUTOENCODER_LATENT'
      && parent.representationFamily === 'SEMANTIC_EMBEDDING';
    const semanticMrlRootEdge = parent.representationId === 'semantic_768'
      && node.representationFamily === 'SEMANTIC_EMBEDDING'
      && parent.representationFamily === 'SEMANTIC_EMBEDDING';
    if (!semanticRootEdge && !semanticMrlRootEdge && parent.representationFamily !== node.representationFamily) {
      throw new Error(`DAG_CROSS_FAMILY_EDGE:${parent.nodeKey}->${node.nodeKey}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visiting.has(key)) throw new Error(`DAG_CYCLE:${key}`);
    if (visited.has(key)) return;
    visiting.add(key);
    const node = byKey.get(key);
    if (node?.parentNodeKey !== null && node?.parentNodeKey !== undefined) {
      visit(node.parentNodeKey);
    }
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of byKey.keys()) visit(key);
}
