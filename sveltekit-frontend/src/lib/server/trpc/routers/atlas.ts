/**
 * First tRPC-facing Parent Atlas operation wired to the canonical
 * pre-call schemas — see
 * src/lib/server/parent-atlas/precall/retrieve-evidence-service.ts and
 * openspec/changes/parent-atlas-runtime-ownership-precall/proposal.md.
 *
 * This satisfies the MCP_OR_TRPC_CONSUMER_READS_RESULT gate: a real,
 * routed tRPC procedure that calls the service and returns its
 * schema-validated output to a caller.
 */

import { publicProcedure, router } from '../init.js';
import { z } from 'zod';
import {
  RetrieveEvidenceInputSchema,
  RetrieveEvidenceOutputSchema,
} from '$lib/server/parent-atlas/precall/retrieve-evidence-schema.js';
import {
  retrieveEvidence,
  RetrieveEvidenceInputError,
} from '$lib/server/parent-atlas/precall/retrieve-evidence-service.js';
import {
  PacketRegistryRpcResultV1Schema,
  unavailablePacketRegistryResultV1,
} from '$lib/server/atlas/contracts/rpc-packet-registry-client-v1.js';

const GetPacketRegistryInputSchema = z.object({
  workspaceId: z.string().optional(),
  workspaceRevision: z.string().optional(),
}).default({});

export const atlasRouter = router({
  getPacketRegistry: publicProcedure
    .input(GetPacketRegistryInputSchema)
    .output(PacketRegistryRpcResultV1Schema)
    .query(async () => {
      try {
        // The current live schema has no canonical packet_revision owner or
        // closed packet/source/AST joins. Do not promote a static lane census
        // to an available registry response.
        return unavailablePacketRegistryResultV1('ATLAS_PACKET_REGISTRY_UNAVAILABLE');
      } catch (err) {
        return unavailablePacketRegistryResultV1(
          err instanceof Error ? err.message : 'ATLAS_PACKET_REGISTRY_UNAVAILABLE'
        );
      }
    }),

  retrieveEvidence: publicProcedure
    .input(RetrieveEvidenceInputSchema)
    .output(RetrieveEvidenceOutputSchema)
    .query(async ({ input }) => {
      try {
        return await retrieveEvidence(input);
      } catch (error) {
        if (error instanceof RetrieveEvidenceInputError) {
          throw error;
        }
        // Anything else (embedding backend down, Postgres/Qdrant/Neo4j
        // connection failure, etc.) becomes a schema-valid degraded
        // response rather than an unstructured 500 — every lane
        // reported not_configured/error, zero evidence, still a
        // schema-conformant shape a caller can read without special-casing.
        return RetrieveEvidenceOutputSchema.parse({
          workspaceRevision: input.workspaceRevision,
          evidence: [],
          lanes: [
            {
              lane: 'orchestrator',
              status: 'error' as const,
              candidateCount: 0,
              reason: error instanceof Error ? error.message : 'retrieve_evidence_failed',
              fallbackUsed: false,
            },
          ],
        });
      }
    }),
});
