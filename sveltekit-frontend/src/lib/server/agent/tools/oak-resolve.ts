/**
 * OAKLIB Ontology Resolution Tool for LangChain Autonomous Agent
 *
 * Implements AR-07 / CENTROID-CACHE-KEY-CONTRACT-01 ontology grounding:
 *   - Calls the live OAK kernel (:8095 /oak) via resolveOakEvidenceV1
 *   - Strictly read-only and fail-closed
 *   - Returns canonical CURIE, preferred label, synonyms, and ancestors
 *   - canonicalAuthority: false, writesPerformed: false
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { resolveOakEvidenceV1 } from '$lib/server/atlas/agentic/oak-resolution-evidence-client.js';

export const OakResolveToolInputSchema = z.object({
  term: z
    .string()
    .min(1, 'Search term must be non-empty')
    .max(500, 'Search term exceeds maximum length')
    .describe('Domain keyword, legal concept, or entity name to resolve against the OAK ontology'),
});

export type OakResolveToolInput = z.infer<typeof OakResolveToolInputSchema>;

export function createOakResolveTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'oak_resolve_concept',
    description:
      'Resolve a legal, architectural, or domain concept against the OAK ontology kernel (:8095). ' +
      'Returns the matched CURIE, preferred label, synonyms, ancestor hierarchy, and evidence refs. ' +
      'Read-only grounding boundary.',
    schema: OakResolveToolInputSchema,
    func: async ({ term }: OakResolveToolInput) => {
      try {
        const evidence = await resolveOakEvidenceV1(term, { timeoutMs: 3000 });
        return JSON.stringify({
          term,
          state: evidence.state,
          curie: evidence.resolvedCurie,
          preferredLabel: evidence.preferredLabel,
          synonyms: evidence.synonyms,
          ancestors: evidence.ancestors,
          evidenceRefs: evidence.evidenceRefs,
          canonicalAuthority: false,
        });
      } catch (err) {
        return JSON.stringify({
          term,
          state: 'RESOLUTION_UNAVAILABLE',
          error: err instanceof Error ? err.message : String(err),
          canonicalAuthority: false,
        });
      }
    },
  });
}
