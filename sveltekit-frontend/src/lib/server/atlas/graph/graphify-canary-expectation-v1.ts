import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

const sha256RevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

/**
 * Read-only identity envelope for a future snapshot-bound Graphify canary.
 *
 * This contract does not authorize execution and does not grant canonical
 * authority. It only freezes the four authority inputs the canary must echo
 * unchanged in its terminal receipt. Workspace and snapshot revisions are
 * deliberately independent fields so neither can stand in for the other.
 */
export const GraphifyCanaryExpectationInputSchema = z.object({
  workspaceRevision: sha256RevisionSchema,
  snapshotRevision: sha256RevisionSchema,
  sourceSelectionChecksum: sha256RevisionSchema,
  sourceCount: z.number().int().positive(),
}).strict();

export type GraphifyCanaryExpectationInputV1 = z.infer<typeof GraphifyCanaryExpectationInputSchema>;

export const GraphifyCanaryExpectationV1Schema = z.object({
  schema: z.literal('atlas.graphify-canary-expectation.v1'),
  workspaceRevision: sha256RevisionSchema,
  snapshotRevision: sha256RevisionSchema,
  sourceSelectionChecksum: sha256RevisionSchema,
  sourceCount: z.number().int().positive(),
  identityChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  graphifyExecutionAuthorized: z.literal(false),
  canonicalWritesAuthorized: z.literal(false),
  authority: z.literal(false),
}).strict();

export type GraphifyCanaryExpectationV1 = z.infer<typeof GraphifyCanaryExpectationV1Schema>;

export function buildGraphifyCanaryExpectationV1(
  input: GraphifyCanaryExpectationInputV1,
): GraphifyCanaryExpectationV1 {
  const parsed = GraphifyCanaryExpectationInputSchema.parse(input);
  const identityChecksum = canonicalSha256V1({
    schema: 'atlas.graphify-canary-expectation-identity.v1',
    ...parsed,
  });

  return GraphifyCanaryExpectationV1Schema.parse({
    schema: 'atlas.graphify-canary-expectation.v1',
    ...parsed,
    identityChecksum,
    graphifyExecutionAuthorized: false,
    canonicalWritesAuthorized: false,
    authority: false,
  });
}

export function verifyGraphifyCanaryExpectationV1(
  expectation: GraphifyCanaryExpectationV1,
): boolean {
  const parsed = GraphifyCanaryExpectationV1Schema.safeParse(expectation);
  if (!parsed.success) return false;
  const expected = buildGraphifyCanaryExpectationV1({
    workspaceRevision: parsed.data.workspaceRevision,
    snapshotRevision: parsed.data.snapshotRevision,
    sourceSelectionChecksum: parsed.data.sourceSelectionChecksum,
    sourceCount: parsed.data.sourceCount,
  });
  return expected.identityChecksum === parsed.data.identityChecksum;
}
