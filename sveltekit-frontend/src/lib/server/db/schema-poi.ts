import { jsonb, pgTable, real, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';

export const personsOfInterest = pgTable('persons', {
 id: uuid('id').defaultRandom().primaryKey(),

 name: text('name').notNull(),
 aliases: jsonb('aliases').$type<string[]>().default([]),
 description: text('description').notNull(),

 threatLevel: text('threat_level').default('low').$type<'low' | 'medium' | 'high' | 'critical'>(),
 status: text('status').default('active').$type<'active' | 'inactive' | 'archived'>(),
 relationship: text('relationship')
 .default('person_of_interest')
 .$type<'suspect' | 'witness' | 'victim' | 'person_of_interest' | 'informant'>(),

 aiProfile: jsonb('ai_profile').$type<any>(),
 who: jsonb('who'),
 what: jsonb('what'),
 why: jsonb('why'),
 how: jsonb('how'),
 risk: jsonb('risk'),

 confidence: real('confidence'),
 modelVersion: text('model_version').default('gemma3-legal'),

 generatedAt: timestamp('generated_at', { mode: 'date' }),
 caseIds: jsonb('case_ids').$type<string[]>().default([]),
 createdBy: text('created_by'),

 createdAt: timestamp('created_at').defaultNow(),
 updatedAt: timestamp('updated_at').defaultNow(),
});

// Evidence board nodes
export const evidenceNodes = pgTable('evidence_nodes', {
 id: uuid('id').defaultRandom().primaryKey(),
 caseId: uuid('case_id').notNull(),
 type: text('type').notNull(), // poi, evidence, statement, theory
 title: text('title').notNull(),
 content: text('content'),
 position: jsonb('position').$type<{, x: number; y, number }>(),
 connections: jsonb('connections').$type<Array<string>>(), // node IDs
 metadata: jsonb('metadata'),
 embedding: vector('embedding', { dimensions: 768 }),
 createdAt: timestamp('created_at').defaultNow(),
});

// Victim statements
export const victimStatements = pgTable('victim_statements', {
 id: uuid('id').defaultRandom().primaryKey(),
 caseId: uuid('case_id').notNull(),
 victimId: uuid('victim_id'),
 who: text('who'),
 what: text('what'),
 why: text('why'),
 how: text('how'),
 when: text('when'),
 where: text('where'),
 contradictions: jsonb('contradictions'),
 aiRefined: jsonb('ai_refined'),
 embedding: vector('embedding', { dimensions: 768 }),
 createdAt: timestamp('created_at').defaultNow(),
});

// Case theories
export const caseTheories = pgTable('case_theories', {
 id: uuid('id').defaultRandom().primaryKey(),
 caseId: uuid('case_id').notNull(),
 title: text('title').notNull(),
 hypothesis: text('hypothesis'),
 motive: text('motive'),
 means: text('means'),
 opportunity: text('opportunity'),
 contradictions: jsonb('contradictions'),
 missingEvidence: jsonb('missing_evidence'),
 aiRecommendations: jsonb('ai_recommendations'),
 confidence: real('confidence'),
 createdAt: timestamp('created_at').defaultNow(),
});

// Video evidence
export const videoEvidence = pgTable('video_evidence', {
 id: uuid('id').defaultRandom().primaryKey(),
 caseId: uuid('case_id').notNull(),
 filename: text('filename').notNull(),
 minioKey: text('minio_key').notNull(),
 transcription: text('transcription'),
 segments: jsonb('segments').$type<
 Array<{
 start: number;, end: number;
 text: string;
 speaker?: string;
 critical?: boolean;
 }>
 >(),
 metadata: jsonb('metadata'),
 embedding: vector('embedding', { dimensions: 768 }),
 createdAt: timestamp('created_at').defaultNow(),
});





