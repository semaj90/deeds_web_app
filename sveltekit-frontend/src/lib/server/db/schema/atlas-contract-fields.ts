import { pgTable, text, serial, timestamp, index } from 'drizzle-orm/pg-core';

export const atlasContractFields = pgTable('atlas_contract_fields', {
  id: serial('id').primaryKey(),
  rawField: text('raw_field').notNull(),
  canonicalField: text('canonical_field').notNull(),
  entityType: text('entity_type').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  rawFieldIdx: index('idx_acf_raw_field').on(table.rawField),
  canonicalFieldIdx: index('idx_acf_canonical_field').on(table.canonicalField),
}));

export type AtlasContractField = typeof atlasContractFields.$inferSelect;
export type NewAtlasContractField = typeof atlasContractFields.$inferInsert;
