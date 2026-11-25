import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { VerifiedExternalDocCitationV1 } from './external-doc-citation-readback-v1.js';

const sha256Schema = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/);

export const DocumentationFactSpanProposalV1Schema = z.object({
  kind: z.enum(['API_SIGNATURE', 'PARAMETER_CONSTRAINT', 'VERSION_ASSERTION', 'DEPRECATION', 'ERROR_PATTERN', 'DOCUMENTED_RULE']),
  text: z.string().min(1).max(4000),
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().positive(),
  extractorRevision: z.string().min(1).max(256),
}).strict();

export const DocumentationFactV1Schema = z.object({
  schema: z.literal('atlas.documentation-fact.v1'),
  kind: DocumentationFactSpanProposalV1Schema.shape.kind,
  text: z.string().min(1),
  source: z.object({
    pageId: z.string().min(1),
    chunkId: z.string().min(1),
    sourceRevision: z.string().min(1),
    chunkEvidenceRevision: z.string().min(1),
    chunkChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    startByte: z.number().int().nonnegative(),
    endByte: z.number().int().positive(),
    quoteSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  extractorRevision: z.string().min(1),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type DocumentationFactSpanProposalV1 = z.infer<typeof DocumentationFactSpanProposalV1Schema>;
export type DocumentationFactV1 = z.infer<typeof DocumentationFactV1Schema>;

/** Bind a proposal span to bytes already verified by the canonical PG readback owner. */
export function bindDocumentationFactSpanV1(input: {
  citation: VerifiedExternalDocCitationV1;
  proposal: DocumentationFactSpanProposalV1;
}): DocumentationFactV1 | null {
  const proposal = DocumentationFactSpanProposalV1Schema.safeParse(input.proposal);
  const citation = input.citation;
  if (!proposal.success || citation.sourceAuthority !== 'OFFICIAL'
    || citation.endByte <= citation.startByte
    || Buffer.byteLength(citation.verifiedText, 'utf8') !== citation.endByte - citation.startByte) return null;

  const bytes = Buffer.from(citation.verifiedText, 'utf8');
  const { startByte, endByte, text } = proposal.data;
  if (endByte <= startByte || endByte > bytes.length) return null;
  const exact = bytes.subarray(startByte, endByte);
  if (!exact.equals(Buffer.from(text, 'utf8')) || exact.toString('utf8') !== text) return null;

  return DocumentationFactV1Schema.parse({
    schema: 'atlas.documentation-fact.v1',
    kind: proposal.data.kind,
    text,
    source: {
      pageId: citation.pageId,
      chunkId: citation.chunkId,
      sourceRevision: citation.sourceRevision,
      chunkEvidenceRevision: citation.chunkEvidenceRevision,
      chunkChecksum: citation.chunkChecksum,
      startByte: citation.startByte + startByte,
      endByte: citation.startByte + endByte,
      quoteSha256: createHash('sha256').update(exact).digest('hex'),
    },
    extractorRevision: proposal.data.extractorRevision,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
