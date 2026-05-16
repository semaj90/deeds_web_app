import { integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { cases } from './legal-cases.js';

export const evidence = pgTable('evidence', {
 id: uuid('id').defaultRandom().primaryKey(),
 caseId: uuid('case_id')
  .notNull()
  .references(() => cases.id, { onDelete: 'cascade' }),

 // file metadata
 kind: varchar('kind', { length: 32 }).notNull(), // document | video | image | audio | other
 title: varchar('title', { length: 256 }).notNull(),
 description: text('description'),
 fileKey: text('file_key').notNull(), // MinIO / S3 key
 mimeType: varchar('mime_type', { length: 128 }),
 sizeBytes: varchar('size_bytes', { length: 32 }),

 // integrity
 hash: varchar('hash', { length: 128 }),
 hashAlgorithm: varchar('hash_algorithm', { length: 32 }),

 // AI extraction / tags
 tags: jsonb('tags')
  .$type<string[]>()
  .default([] as any),
 aiSummary: text('ai_summary'),
 uploadedByUserId: integer('uploaded_by_user_id'),
 createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});



