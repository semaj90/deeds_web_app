import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TreeNodeIdentityAuthoritySchema } from '$lib/schemas/tree_node_identity_schema.js';

export const DomainPredictionSchema = z.object({
  domain_id: z.string().min(1),
  label: z.string().min(1),
  probability: z.number().min(0).max(1),
  classifier: z.string().min(1),
  classifier_version: z.string().min(1),
});

export const OntologyLinkSchema = z.object({
  ontology_id: z.string().min(1),
  concept_id: z.string().min(1),
  relation: z.enum(['IMPLEMENTS', 'USES', 'RETURNS', 'ACCEPTS', 'GOVERNS', 'VALIDATES', 'DEPENDS_ON', 'RELATED_TO']),
  confidence: z.number().min(0).max(1),
  evidence_ref: z.string().min(1),
});

export const PosEvidenceSchema = z.object({
  tag: z.string().min(1),
  token: z.string().min(1),
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().nonnegative(),
  source: z.enum(['parser', 'nlp', 'merged']),
});

export const EnrichedTreeNodeSchema = z.object({
  identity: TreeNodeIdentityAuthoritySchema,
  ast: z.object({
    language: z.string().min(1),
    node_kind: z.string().min(1),
    parent_tree_node_id: z.string().min(1).nullable(),
    symbol_path: z.array(z.string().min(1)).default([]),
    start_byte: z.number().int().nonnegative(),
    end_byte: z.number().int().nonnegative(),
  }),
  pos: z.array(PosEvidenceSchema).default([]),
  domains: z.array(DomainPredictionSchema).min(1).superRefine((values, ctx) => {
    const total = values.reduce((sum, value) => sum + value.probability, 0);
    if (total > 1.000001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Domain probabilities must sum to at most one (received ${total.toFixed(4)})`,
      });
    }
  }),
  ontology_links: z.array(OntologyLinkSchema).default([]),
  revisions: z.object({
    workspace_revision: z.string().min(1),
    source_hash: z.string().min(40),
    embedding_revision: z.string().min(1).nullable(),
    graph_revision: z.string().min(1).nullable(),
    ontology_revision: z.string().min(1).nullable(),
    classifier_revision: z.string().min(1).nullable(),
  }),
});

export type DomainPrediction = z.infer<typeof DomainPredictionSchema>;
export type OntologyLink = z.infer<typeof OntologyLinkSchema>;
export type PosEvidence = z.infer<typeof PosEvidenceSchema>;
export type EnrichedTreeNode = z.infer<typeof EnrichedTreeNodeSchema>;

export interface EnrichedTreeNodeLinkedTupleDraft {
  tupleId: string;
  schemaVersion: 'ontology-linked-tuple.v1';
  packetKey?: string;
  sourceRef: string;
  treeNodeId?: string;
  documentId?: string;
  titleId?: string;
  surfaceText: string;
  tokenIndex?: number | null;
  partOfSpeech?: string | null;
  label: string;
  labelKind: 'pos' | 'tag' | 'ontology';
  labelSource: 'pos_tagger' | 'semantic_tagger' | 'regex' | 'ner' | 'llm' | 'manual';
  ontologyIds: string[];
  conceptIds: string[];
  confidence: number;
  evidenceState: 'ACTIVE_VERIFIED' | 'ACTIVE_DEGRADED' | 'GATED' | 'REFERENCE_ONLY' | 'SUPERSEDED' | 'FAILED';
  provenance: {
    sourceTables: string[];
    labelerVersion: string | null;
    taggerVersion: string | null;
    ontologyVersion: string | null;
    nlpVersion: string | null;
  };
}

function hashTupleId(parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function materializeLinkedTupleDraftsFromEnrichedTreeNode(input: {
  node: EnrichedTreeNode;
  packetKey: string;
  sourceRef: string;
  documentId?: string | null;
  sourceTables: string[];
  labelerVersion?: string | null;
  taggerVersion?: string | null;
  ontologyVersion?: string | null;
  nlpVersion?: string | null;
}): EnrichedTreeNodeLinkedTupleDraft[] {
  const sourceTables = uniqueStrings(input.sourceTables).slice(0, 12);
  const treeNodeId = input.node.identity.tree_node_id;
  const titleId: string | undefined = undefined;
  const featureLabel = input.node.identity.feature_label;
  const primaryDomain = input.node.domains[0] ?? null;
  const ontologyIds = uniqueStrings([
    input.node.identity.feature_id,
    ...input.node.ontology_links.map((link) => link.ontology_id),
  ]).slice(0, 32);
  const conceptIds = uniqueStrings(
    input.node.ontology_links.map((link) => link.concept_id)
  ).slice(0, 32);

  const drafts: EnrichedTreeNodeLinkedTupleDraft[] = [];

  drafts.push({
    tupleId: hashTupleId([
      'ontology-linked-tuple.v1',
      input.packetKey,
      input.sourceRef,
      treeNodeId,
      String(titleId ?? ''),
      featureLabel,
      'primary',
    ]),
    schemaVersion: 'ontology-linked-tuple.v1',
    packetKey: input.packetKey,
    sourceRef: input.sourceRef,
    treeNodeId,
    documentId: input.documentId ?? undefined,
    titleId,
    surfaceText: featureLabel,
    tokenIndex: 0,
    partOfSpeech: input.node.pos[0]?.tag ?? null,
    label: primaryDomain?.label ?? featureLabel,
    labelKind: ontologyIds.length > 0 ? 'ontology' : 'tag',
    labelSource: primaryDomain ? 'semantic_tagger' : 'manual',
    ontologyIds,
    conceptIds,
    confidence: primaryDomain?.probability ?? 0.72,
    evidenceState: 'ACTIVE_VERIFIED',
    provenance: {
      sourceTables,
      labelerVersion: input.labelerVersion ?? null,
      taggerVersion: input.taggerVersion ?? null,
      ontologyVersion: input.ontologyVersion ?? null,
      nlpVersion: input.nlpVersion ?? null,
    },
  });

  for (const [index, domain] of input.node.domains.entries()) {
    drafts.push({
      tupleId: hashTupleId([
        'ontology-linked-tuple.v1',
        input.packetKey,
        input.sourceRef,
        treeNodeId,
        String(titleId ?? ''),
        domain.domain_id,
        `domain:${index}`,
      ]),
      schemaVersion: 'ontology-linked-tuple.v1',
      packetKey: input.packetKey,
      sourceRef: input.sourceRef,
      treeNodeId,
      documentId: input.documentId ?? undefined,
      titleId,
      surfaceText: domain.label,
      tokenIndex: index + 1,
      partOfSpeech: null,
      label: domain.label,
      labelKind: 'tag',
      labelSource: 'semantic_tagger',
      ontologyIds: [],
      conceptIds: [],
      confidence: domain.probability,
      evidenceState: 'ACTIVE_VERIFIED',
      provenance: {
        sourceTables,
        labelerVersion: input.labelerVersion ?? null,
        taggerVersion: input.taggerVersion ?? null,
        ontologyVersion: input.ontologyVersion ?? null,
        nlpVersion: input.nlpVersion ?? null,
      },
    });
  }

  for (const [index, pos] of input.node.pos.entries()) {
    drafts.push({
      tupleId: hashTupleId([
        'ontology-linked-tuple.v1',
        input.packetKey,
        input.sourceRef,
        treeNodeId,
        String(titleId ?? ''),
        pos.tag,
        `pos:${index}`,
      ]),
      schemaVersion: 'ontology-linked-tuple.v1',
      packetKey: input.packetKey,
      sourceRef: input.sourceRef,
      treeNodeId,
      documentId: input.documentId ?? undefined,
      titleId,
      surfaceText: pos.token,
      tokenIndex: pos.start_byte,
      partOfSpeech: pos.tag,
      label: pos.tag,
      labelKind: 'pos',
      labelSource: pos.source === 'parser' ? 'regex' : 'pos_tagger',
      ontologyIds: [],
      conceptIds: [],
      confidence: 0.9,
      evidenceState: 'ACTIVE_VERIFIED',
      provenance: {
        sourceTables,
        labelerVersion: input.labelerVersion ?? null,
        taggerVersion: input.taggerVersion ?? null,
        ontologyVersion: input.ontologyVersion ?? null,
        nlpVersion: input.nlpVersion ?? null,
      },
    });
  }

  return drafts;
}
