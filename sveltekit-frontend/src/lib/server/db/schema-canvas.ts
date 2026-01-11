import { pgTable, text, varchar, integer, timestamp, boolean, decimal, serial, uuid, real, jsonb } from 'drizzle-orm/pg-core';
import { users, cases } from './schema-postgres.js';
import { relations } from 'drizzle-orm';

// === CANVAS STATES ===
// Represents a saved canvas/whiteboard state
export const canvasStates = pgTable('canvas_states', {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).default('Untitled Canvas').notNull(),
    description: text('description'),
    data: jsonb('data').default({}).notNull(), // The Konva/Canvas nodes JSON
    thumbnailUrl: text('thumbnail_url'),
    isPublic: boolean('is_public').default(false).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// === REPORTS & DOCUMENTS ON CANVAS ===
export const reports = pgTable("reports", {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    caseId: uuid("case_id")
        .notNull()
        .references(() => cases.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 256 }).default("Untitled Report").notNull(),
    // Store the structured JSON from HugerTE/Slate.js rich text editor
    content: jsonb("content").default({}).notNull(),
    // Store the position and size of the node on the canvas
    posX: real("pos_x").default(50).notNull(),
    posY: real("pos_y").default(50).notNull(),
    width: real("width").default(650).notNull(),
    height: real("height").default(450).notNull(),
    // Report metadata
    reportType: varchar("report_type", { length: 50 })
        .default("investigation")
        .notNull(),
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    tags: jsonb("tags").default([]).notNull(),
    aiSummary: text("ai_summary"),
    // Timestamps and ownership
    createdBy: uuid("created_by")
        .notNull()
        .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull()
});

// Relations
export const canvasStatesRelations = relations(canvasStates, ({ one, many }) => ({
    user: one(users, {
        fields: [canvasStates.userId],
        references: [users.id],
    }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
    case: one(cases, {
        fields: [reports.caseId],
        references: [cases.id],
    }),
    creator: one(users, {
        fields: [reports.createdBy],
        references: [users.id],
    }),
}));


