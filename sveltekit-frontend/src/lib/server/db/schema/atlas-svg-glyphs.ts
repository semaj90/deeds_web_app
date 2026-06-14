import { pgTable, text, uuid, timestamp, index, varchar } from 'drizzle-orm/pg-core';

export const atlasSvgGlyphs = pgTable('atlas_svg_glyphs', {
  id: uuid('id').primaryKey().defaultRandom(),
  packetKey: varchar('packet_key', { length: 255 }).unique().notNull(),
  sourceRef: varchar('source_ref', { length: 255 }),
  glyphId: varchar('glyph_id', { length: 255 }).notNull(),
  glyphType: varchar('glyph_type', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  packetKeyIdx: index('idx_svg_glyphs_packet_key').on(table.packetKey),
  sourceRefIdx: index('idx_svg_glyphs_source_ref').on(table.sourceRef),
  glyphIdIdx: index('idx_svg_glyphs_glyph_id').on(table.glyphId),
  glyphTypeIdx: index('idx_svg_glyphs_glyph_type').on(table.glyphType),
}));
