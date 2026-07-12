import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb
} from "drizzle-orm/pg-core";

/**
 * Metadata for files uploaded to SeaweedFS/S3.
 */
export const uploadedFiles = pgTable("uploaded_files", {
  id: uuid("id").defaultRandom().primaryKey(),

  originalName: text("original_name").notNull(),
  objectKey: text("object_key").notNull().unique(),
  bucket: text("bucket").notNull(),

  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes").notNull(),

  status: text("status").notNull().default("uploaded"), // 'uploaded' | 'processed' | 'error'
  metadata: jsonb("metadata").default({}).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type NewUploadedFile = typeof uploadedFiles.$inferInsert;
