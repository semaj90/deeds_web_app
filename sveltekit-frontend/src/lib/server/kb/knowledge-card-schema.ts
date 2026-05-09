import { z } from 'zod';

export const knowledgeCardDomainSchema = z.enum(['legal', 'codebase']);
export const knowledgeCardConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const knowledgeCardStatusSchema = z.enum(['active', 'tombstone']);

export const knowledgeCardSchema = z
  .object({
    card_id: z.string().min(1),
    domain: knowledgeCardDomainSchema,
    source_id: z.string().min(1),
    source_path: z.string().min(1).optional(),
    source_hash: z.string().min(1),
    title: z.string().min(1),
    kind: z.string().min(1),
    tags: z.array(z.string()),
    summary: z.string(),
    search_text: z.string().min(1),
    context_text: z.string().min(1),
    citations: z.array(z.string()).optional(),
    evidence_ids: z.array(z.string()).optional(),
    graph_neighbors: z.array(z.string()).optional(),
    confidence: knowledgeCardConfidenceSchema,
    status: knowledgeCardStatusSchema,
    updated_at: z.string().min(1),
  })
  .passthrough();

export type KnowledgeCardDomain = z.infer<typeof knowledgeCardDomainSchema>;
export type KnowledgeCardConfidence = z.infer<typeof knowledgeCardConfidenceSchema>;
export type KnowledgeCardStatus = z.infer<typeof knowledgeCardStatusSchema>;
export type KnowledgeCard = z.infer<typeof knowledgeCardSchema>;
