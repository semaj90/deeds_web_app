import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const atlasCards = pgTable('atlas_cards', {
  file: text('file').primaryKey(),
  type: text('type'),
  data: jsonb('data'),
  createdAt: timestamp('created_at').defaultNow()
});
