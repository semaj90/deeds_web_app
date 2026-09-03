import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import type {
  AceFeatureSnapshotProducerInputV1,
} from '../context/ace-feature-snapshot-producer-v1.js';
import { RetrievalRouterFeatureRowV1Schema } from '../contracts/retrieval-router-feature-row-v1.js';
import type { CandidateFeatureLaneV1 } from '../features/retrieval-router-to-candidate-feature-snapshot-v1.js';

const candidateSchema = z.object({
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
}).strict();

export type SearchRuntimeAceCandidateV1 = z.infer<typeof candidateSchema>;

export interface SearchRuntimeAceResolverSourcesV1 {
  candidates: readonly SearchRuntimeAceCandidateV1[];
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  rows: readonly z.input<typeof RetrievalRouterFeatureRowV1Schema>[];
  laneMaskByOrdinal: Readonly<Record<string, readonly CandidateFeatureLaneV1[]>>;
  producerRevision: string;
  requestId: string;
  tokenBudget: number;
  retrievalPolicyRevision: string;
  acePlaybookRevision: string;
  representationRevision: string | null;
  graphRevision: string | null;
  ontologyRevision?: string | null;
  modelRevision?: string | null;
  promptTemplateRevision?: string | null;
}

export interface SearchRuntimeAceResolverV1 {
  resolve(input: { query: string; requestId: string; workspaceRevision: string }):
    Promise<AceFeatureSnapshotProducerInputV1>;
}

function rejectSyntheticRevision(value: string, field: string): void {
  if (/^(?:workspace|source|graph|feature|representation):?now|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/i.test(value)) {
    throw new Error(`ACE_RESOLVER_SYNTHETIC_REVISION_REJECTED:${field}`);
  }
}

/**
 * Composes already-admitted SearchRuntime outputs. It deliberately does not
 * search any store, assign ordinals, infer revisions, or perform cache writes.
 */
export function createSearchRuntimeAceResolverV1(
  resolveSources: (input: { query: string; requestId: string; workspaceRevision: string }) =>
    Promise<SearchRuntimeAceResolverSourcesV1>,
): SearchRuntimeAceResolverV1 {
  return {
    async resolve(input) {
      const sources = await resolveSources(input);
      const ordinalMap = candidateOrdinalMapV1Schema.parse(sources.ordinalMap);
      if (ordinalMap.workspaceRevision !== input.workspaceRevision) {
        throw new Error('ACE_RESOLVER_WORKSPACE_REVISION_MISMATCH');
      }
      rejectSyntheticRevision(ordinalMap.workspaceRevision, 'workspaceRevision');
      if (sources.candidates.length !== ordinalMap.rowCount) {
        throw new Error('ACE_RESOLVER_CANDIDATE_ORDINAL_MAP_COUNT_MISMATCH');
      }
      if (sources.rows.length !== ordinalMap.rowCount) {
        throw new Error('ACE_RESOLVER_FEATURE_ROWS_MISSING');
      }

      const candidateById = new Map(sources.candidates.map((candidate) => {
        const parsed = candidateSchema.parse(candidate);
        return [parsed.canonicalId, parsed] as const;
      }));
      if (candidateById.size !== sources.candidates.length) {
        throw new Error('ACE_RESOLVER_CANDIDATE_FEATURE_MISMATCH');
      }

      const seenOrdinals = new Set<number>();
      for (const rowInput of sources.rows) {
        const row = RetrievalRouterFeatureRowV1Schema.parse(rowInput);
        if (seenOrdinals.has(row.candidateOrdinal)) {
          throw new Error(`ACE_RESOLVER_FEATURE_ROW_DUPLICATE:${row.candidateOrdinal}`);
        }
        seenOrdinals.add(row.candidateOrdinal);
        const candidate = ordinalMap.candidates[row.candidateOrdinal];
        const runtimeCandidate = candidateById.get(row.canonicalId);
        if (!candidate || !runtimeCandidate || candidate.canonicalId !== row.canonicalId
          || candidate.packetKey !== row.packetKey || candidate.sourceRef !== row.sourceRef
          || candidate.sourceRevision !== row.sourceRevision
          || String(row.workspaceRevision) !== candidate.workspaceRevision) {
          throw new Error(`ACE_RESOLVER_CANDIDATE_FEATURE_MISMATCH:${row.candidateOrdinal}`);
        }
        rejectSyntheticRevision(candidate.sourceRevision, 'sourceRevision');
      }
      if (seenOrdinals.size !== ordinalMap.rowCount) {
        throw new Error('ACE_RESOLVER_FEATURE_ROWS_MISSING');
      }
      for (const candidate of ordinalMap.candidates) {
        if (!candidateById.has(candidate.canonicalId)) {
          throw new Error(`ACE_RESOLVER_CANDIDATE_MISSING:${candidate.canonicalId}`);
        }
      }
      if (!sources.producerRevision.trim()) throw new Error('ACE_RESOLVER_PRODUCER_REVISION_MISSING');
      if (!sources.retrievalPolicyRevision.trim()) throw new Error('ACE_RESOLVER_RETRIEVAL_POLICY_REVISION_MISSING');
      if (!sources.acePlaybookRevision.trim()) throw new Error('ACE_RESOLVER_ACE_PLAYBOOK_REVISION_MISSING');
      if (!sources.representationRevision?.trim()) throw new Error('ACE_RESOLVER_REPRESENTATION_REVISION_MISSING');

      return {
        ordinalMap,
        rows: sources.rows,
        laneMaskByOrdinal: sources.laneMaskByOrdinal,
        producerRevision: sources.producerRevision,
        requestId: input.requestId,
        tokenBudget: sources.tokenBudget,
        retrievalPolicyRevision: sources.retrievalPolicyRevision,
        acePlaybookRevision: sources.acePlaybookRevision,
        representationRevision: sources.representationRevision,
        graphRevision: sources.graphRevision,
        ontologyRevision: sources.ontologyRevision,
        modelRevision: sources.modelRevision,
        promptTemplateRevision: sources.promptTemplateRevision,
      };
    },
  };
}
