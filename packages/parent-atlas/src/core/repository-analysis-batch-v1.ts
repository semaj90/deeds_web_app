import { z } from 'zod';
import { LanguageLabelNamespaceV1Schema, LanguageLabelResolutionV1Schema } from './language-registry-v1.js';
import { atlasAstEvidenceV1Schema, chunkerEvidenceAdapterReceiptSchema } from './treesitter-chunker-evidence-adapter.js';
import { lspSemanticObservationSchema, verifiedSourceByteSpanSchema } from './lsp-semantic-observation.js';

const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const sourceRef = z.string().min(1);
const sourceIdentityKey = z.string().min(1);

const languageObservationSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('DETECTED'),
    namespace: LanguageLabelNamespaceV1Schema,
    label: z.string().min(1),
    evidenceRef: z.string().min(1),
  }).strict(),
  z.object({
    status: z.literal('UNDETECTED'),
    namespace: LanguageLabelNamespaceV1Schema.nullable(),
    label: z.null(),
    evidenceRef: z.string().min(1),
    reason: z.string().min(1),
  }).strict(),
]);

export const repositoryAnalysisFileRecordV1Schema = z.object({
  schema: z.literal('atlas.repository-analysis-file.v1'),
  sourceIdentityKey,
  sourceRef,
  sourceRepositoryScope: z.string().min(1),
  repositoryRelativePath: z.string().min(1),
  sourceRevision: z.string().min(1),
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().nonnegative(),
  languageObservation: languageObservationSchema,
  languageResolution: LanguageLabelResolutionV1Schema.optional(),
  astEvidence: atlasAstEvidenceV1Schema.optional(),
  chunkerReceipt: chunkerEvidenceAdapterReceiptSchema.optional(),
  lspObservations: z.array(lspSemanticObservationSchema).max(4096).default([]),
  verifiedByteSpans: z.array(verifiedSourceByteSpanSchema).max(16_384).default([]),
}).strict().superRefine((file, ctx) => {
  const contentRevision = `sha256:${file.contentDigest}`;
  if (file.sourceRevision !== contentRevision) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRevision'], message: 'SOURCE_REVISION_CONTENT_DIGEST_MISMATCH' });
  }
  if (file.languageObservation.status === 'DETECTED' && file.languageResolution
    && (file.languageResolution.inputNamespace !== file.languageObservation.namespace
      || file.languageResolution.inputLabel !== file.languageObservation.label)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['languageResolution'], message: 'LANGUAGE_RESOLUTION_INPUT_MISMATCH' });
  }
  if (file.astEvidence) {
    if (file.astEvidence.source_revision !== file.sourceRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['astEvidence', 'source_revision'], message: 'AST_SOURCE_REVISION_MISMATCH' });
    }
    file.astEvidence.chunks.forEach((chunk, index) => {
      if (chunk.end_byte > file.byteLength) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['astEvidence', 'chunks', index, 'end_byte'], message: 'AST_SPAN_EXCEEDS_SOURCE_BYTES' });
      }
    });
  }
  if (file.chunkerReceipt && (file.chunkerReceipt.source_ref !== file.sourceRef
    || file.chunkerReceipt.source_revision !== file.sourceRevision)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['chunkerReceipt'], message: 'CHUNKER_SOURCE_BINDING_MISMATCH' });
  }
  file.lspObservations.forEach((observation, index) => {
    if (observation.source_ref !== file.sourceRef || observation.source_revision !== file.sourceRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lspObservations', index], message: 'LSP_SOURCE_BINDING_MISMATCH' });
    }
  });
  file.verifiedByteSpans.forEach((span, index) => {
    if (span.source_ref !== file.sourceRef || span.source_revision !== file.sourceRevision
      || span.source_content_checksum !== contentRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['verifiedByteSpans', index], message: 'VERIFIED_SPAN_SOURCE_BINDING_MISMATCH' });
    }
    if (span.byte_range.byte_end > file.byteLength) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['verifiedByteSpans', index, 'byte_range'], message: 'VERIFIED_SPAN_EXCEEDS_SOURCE_BYTES' });
    }
  });
});

export const repositoryAnalysisBatchV1Schema = z.object({
  schema: z.literal('atlas.repository-analysis-batch.v1'),
  mode: z.literal('PROPOSAL_ONLY'),
  workspaceRevision: sha256,
  sourceInventorySchema: z.literal('atlas.incremental-workspace-source-inventory.v1'),
  sourceInventoryDigest: sha256,
  sourceInventoryStatus: z.literal('INCREMENTAL_SOURCE_INVENTORY_PROPOSAL_NOT_ADMITTED'),
  files: z.array(repositoryAnalysisFileRecordV1Schema).max(10_000),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict().superRefine((batch, ctx) => {
  const seenRefs = new Set<string>();
  const seenIdentityKeys = new Set<string>();
  batch.files.forEach((file, index) => {
    if (seenRefs.has(file.sourceRef)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['files', index, 'sourceRef'], message: 'DUPLICATE_SOURCE_REF' });
    }
    if (seenIdentityKeys.has(file.sourceIdentityKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['files', index, 'sourceIdentityKey'], message: 'DUPLICATE_SOURCE_IDENTITY_KEY' });
    }
    seenRefs.add(file.sourceRef);
    seenIdentityKeys.add(file.sourceIdentityKey);
    file.lspObservations.forEach((observation, observationIndex) => {
      if (observation.workspace_revision !== batch.workspaceRevision) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['files', index, 'lspObservations', observationIndex, 'workspace_revision'], message: 'LSP_WORKSPACE_REVISION_MISMATCH' });
      }
    });
  });
});

export type RepositoryAnalysisFileRecordV1 = z.infer<typeof repositoryAnalysisFileRecordV1Schema>;
export type RepositoryAnalysisBatchV1 = z.infer<typeof repositoryAnalysisBatchV1Schema>;

export function buildRepositoryAnalysisBatchV1(input: {
  workspaceRevision: string;
  sourceInventoryDigest: string;
  files: RepositoryAnalysisFileRecordV1[];
}): RepositoryAnalysisBatchV1 {
  return repositoryAnalysisBatchV1Schema.parse({
    schema: 'atlas.repository-analysis-batch.v1',
    mode: 'PROPOSAL_ONLY',
    workspaceRevision: input.workspaceRevision,
    sourceInventorySchema: 'atlas.incremental-workspace-source-inventory.v1',
    sourceInventoryDigest: input.sourceInventoryDigest,
    sourceInventoryStatus: 'INCREMENTAL_SOURCE_INVENTORY_PROPOSAL_NOT_ADMITTED',
    files: [...input.files].sort((left, right) => left.sourceRef < right.sourceRef ? -1 : left.sourceRef > right.sourceRef ? 1 : 0),
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
