import { z } from 'zod';

export const CodeRevisionAuthorityColumnV1Schema = z.enum(['source_revision', 'content_hash']);
export type CodeRevisionAuthorityColumnV1 = z.infer<typeof CodeRevisionAuthorityColumnV1Schema>;

export const CodeRevisionAuthorityStatusV1Schema = z.enum([
  'INPUT_INVALID',
  'REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND',
  'REVISION_ORIGIN_NOT_PROVEN',
]);

export const CodeRevisionAuthorityV1Schema = z.object({
  schemaVersion: z.literal('code-revision-authority-v1'),
  sourceRevisionAuthorityColumn: CodeRevisionAuthorityColumnV1Schema,
  legacySourceRevisionColumn: z.literal('source_revision'),
  preservesLegacySourceRevisionSemantics: z.literal(true),
  status: CodeRevisionAuthorityStatusV1Schema,
  sourcePath: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1).nullable(),
  legacySourceRevision: z.string().min(1).nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
  expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
  exactByteDigestMatches: z.boolean(),
  legacyGitProvenanceValid: z.boolean(),
  durableOwnerBound: z.literal(false),
  fanoutMayConsumeAsCanonical: z.literal(false),
}).strict();

export type CodeRevisionAuthorityV1 = z.infer<typeof CodeRevisionAuthorityV1Schema>;

export interface CodeRevisionAuthorityInputV1 {
  sourcePath: string | null;
  workspaceRevision: string | null;
  legacySourceRevision: string | null;
  contentHash: string | null;
  expectedContentHash: string | null;
  authorityColumn: CodeRevisionAuthorityColumnV1;
}

function isValidLegacyGitRevision(value: string | null): boolean {
  return Boolean(value && /^(?:[a-f0-9]{7,64}|(?:refs\/)?(?:heads|tags)\/[A-Za-z0-9._/-]+)$/i.test(value));
}

export function evaluateCodeRevisionAuthority(input: CodeRevisionAuthorityInputV1): CodeRevisionAuthorityV1 {
  const contentHash = input.contentHash?.trim().toLowerCase() || null;
  const expectedContentHash = input.expectedContentHash?.trim().toLowerCase() || null;
  const sourcePath = input.sourcePath?.trim() || null;
  const workspaceRevision = input.workspaceRevision?.trim() || null;
  const legacySourceRevision = input.legacySourceRevision?.trim() || null;
  const exactByteDigestMatches = Boolean(contentHash && expectedContentHash && contentHash === expectedContentHash);
  const legacyGitProvenanceValid = isValidLegacyGitRevision(legacySourceRevision);
  const semanticsProven = Boolean(
    sourcePath && workspaceRevision && exactByteDigestMatches && legacyGitProvenanceValid,
  );

  return CodeRevisionAuthorityV1Schema.parse({
    schemaVersion: 'code-revision-authority-v1',
    sourceRevisionAuthorityColumn: input.authorityColumn,
    legacySourceRevisionColumn: 'source_revision',
    preservesLegacySourceRevisionSemantics: true,
    status: semanticsProven
      ? 'REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND'
      : 'REVISION_ORIGIN_NOT_PROVEN',
    sourcePath,
    workspaceRevision,
    legacySourceRevision,
    contentHash,
    expectedContentHash,
    exactByteDigestMatches,
    legacyGitProvenanceValid,
    durableOwnerBound: false,
    fanoutMayConsumeAsCanonical: false,
  });
}
