import { index, jsonb, pgTable, real, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';

export const savedCitations = pgTable('saved_citations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  caseId: text('case_id'),
  statuteCode: text('statute_code').notNull(),
  statuteTitle: text('statute_title'),
  jurisdiction: text('jurisdiction'),
  severity: text('severity'),
  year: integer('year'),
  sourceType: text('source_type').default('manual'), // 'manual' | 'auto_extracted'
  highlightedText: text('highlighted_text'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const savedCitationAnnotations = pgTable(
  'saved_citation_annotations',
  {
    id: text('id').primaryKey(),
    citationId: uuid('citation_id')
      .notNull()
      .references(() => savedCitations.id, { onDelete: 'cascade' }),
    userId: text('user_id'),
    annotationType: text('annotation_type').notNull().default('comment'),
    body: text('body').notNull(),
    logic: text('logic').notNull().default('add_comment_under_saved_citation'),
    sourceRefs: jsonb('source_refs').$type<string[]>().notNull().default([]),
    chunkIds: jsonb('chunk_ids').$type<string[]>().notNull().default([]),
    llmOutput: text('llm_output'),
    tokenMap: jsonb('token_map')
      .$type<{
        citationTokens?: string[];
        annotationTokens?: string[];
        relation?: string;
      }>()
      .notNull()
      .default({}),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    citationIdx: index('saved_citation_annotations_citation_idx').on(table.citationId),
    userIdx: index('saved_citation_annotations_user_idx').on(table.userId),
    createdIdx: index('saved_citation_annotations_created_idx').on(table.createdAt),
  })
);

export const evidenceBoardEdges = pgTable(
  'evidence_board_edges',
  {
    id: text('id').primaryKey(),
    boardId: text('board_id'),
    fromNodeId: text('from_node_id').notNull(),
    toNodeId: text('to_node_id').notNull(),
    relationType: text('relation_type').notNull(),
    citationId: uuid('citation_id').references(() => savedCitations.id, { onDelete: 'set null' }),
    annotationId: text('annotation_id').references(() => savedCitationAnnotations.id, {
      onDelete: 'set null',
    }),
    confidence: real('confidence').notNull().default(0.5),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    citationIdx: index('evidence_board_edges_citation_idx').on(table.citationId),
    annotationIdx: index('evidence_board_edges_annotation_idx').on(table.annotationId),
    boardIdx: index('evidence_board_edges_board_idx').on(table.boardId),
  })
);

export const CITATION_ANNOTATION_PROGRESS_STATES = [
  'draft_saved_local',
  'uploading',
  'postgres_saved',
  'redis_indexed',
  'embedded',
  'memory_card_refreshed',
  'complete',
] as const;

export type CitationAnnotationProgressState = (typeof CITATION_ANNOTATION_PROGRESS_STATES)[number];

export const CITATION_ANNOTATION_EVENTS = {
  created: 'citation.annotation.created',
  indexRedis: 'citation.annotation.index_redis',
  embed: 'citation.annotation.embed',
  distill: 'citation.annotation.distill',
  edgeCreated: 'evidence.edge.created',
  memoryCardRefresh: 'memory.card.refresh',
} as const;

export const citationAnnotationRedisKeys = {
  annotation: (annotationId: string) => `annotation:${annotationId}`,
  citationAnnotations: (citationId: string) => `citation:${citationId}:annotations`,
  citationMemoryPacket: (citationId: string) => `citation:${citationId}:memory_packet`,
  evidenceBoardEdges: (boardId: string) => `evidence_board:${boardId}:edges`,
  userRecentAnnotations: (userId: string) => `user:${userId}:recent_annotations`,
};

export type SavedCitationAnnotation = typeof savedCitationAnnotations.$inferSelect;
export type NewSavedCitationAnnotation = typeof savedCitationAnnotations.$inferInsert;

export type EvidenceBoardEdge = typeof evidenceBoardEdges.$inferSelect;
export type NewEvidenceBoardEdge = typeof evidenceBoardEdges.$inferInsert;
