/**
 * Zod validation schemas — custom Zod schemas for the highest-traffic tables.
 * To avoid TS compiler errors with custom columns (like pgvector), this file
 * defines clean z.object schemas instead of using drizzle-zod's createInsertSchema.
 * Select types use Drizzle's native $inferSelect.
 */

import { z } from 'zod';
import { cases, evidence, legalDocuments } from './schema-postgres.js';
import { chatMessages } from './schema-chat.js';
import { SharedLabelSchema, type SharedLabel, trustTierEnum } from './schema/normalize-labels.js';

// Export the unified label schema so it is available alongside other zod schemas
export { SharedLabelSchema, type SharedLabel, trustTierEnum };

// ── Cases ─────────────────────────────────────────────────────────────────────

export const insertCaseSchema = z.object({
  title:         z.string().trim().min(1).max(255),
  description:   z.string().max(10_000).optional(),
  caseNumber:    z.string().max(100).optional(),
  priority:      z.enum(['low', 'medium', 'high', 'critical', 'urgent']).default('medium').optional(),
  practiceArea:  z.string().max(100).optional(),
  jurisdiction:  z.string().max(100).optional(),
  court:         z.string().max(200).optional(),
  clientName:    z.string().max(200).optional(),
  opposingParty: z.string().max(200).optional(),
  status:        z.enum(['open', 'in_progress', 'pending_review', 'closed', 'archived', 'active', 'pending', 'under_review']).default('open').optional(),
  assignedAttorney: z.number().int().optional(),
  metadata:      z.record(z.string(), z.any()).default({}).optional(),
});

export type SelectCase = typeof cases.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;

// ── Evidence ──────────────────────────────────────────────────────────────────

export const insertEvidenceSchema = z.object({
  caseId:         z.string().uuid(),
  title:          z.string().trim().min(1).max(255),
  description:    z.string().max(10_000).optional(),
  filePath:       z.string().max(500).optional(),
  fileType:       z.string().max(100).optional(),
  fileSize:       z.number().int().nonnegative().optional(),
  hash:           z.string().max(64).optional(),
  source:         z.string().max(255).optional(),
  dateObtained:   z.string().optional(),
  chainOfCustody: z.any().optional(),
  metadata:       z.record(z.string(), z.any()).default({}).optional(),
  criminalId:     z.string().uuid().optional(),
  evidenceType:   z.string().max(100).optional(),
  subType:        z.string().max(100).optional(),
  fileUrl:        z.string().max(500).optional(),
  fileName:       z.string().max(255).optional(),
  canvasPosition: z.record(z.string(), z.any()).default({}).optional(),
  uploadedBy:     z.number().int().optional(),
  evidenceNumber: z.string().max(100).optional(),
  type:           z.string().max(100).optional(),
  summary:        z.string().optional(),
  mimeType:       z.string().max(100).optional(),
  tags:           z.array(z.string()).default([]).optional(),
  aiTags:         z.array(z.string()).default([]).optional(),
  status:         z.string().max(50).default('pending').optional(),
  extractedText:  z.string().optional(),
  entities:       z.record(z.string(), z.any()).default({}).optional(),
  keywords:       z.array(z.string()).default([]).optional(),
});

export type SelectEvidence = typeof evidence.$inferSelect;
export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;

// ── Legal Documents ───────────────────────────────────────────────────────────

export const insertLegalDocumentSchema = z.object({
  title:        z.string().trim().min(1).max(255),
  content:      z.string().optional(),
  s3Key:        z.string().min(1),
  s3Bucket:     z.string().min(1).default('legal-documents'),
  originalName: z.string().min(1),
  mimeType:     z.string().min(1),
  fileSize:     z.number().int().nonnegative().default(0),
  caseId:       z.string().uuid().optional(),
  evidenceId:   z.string().uuid().optional(),
  status:       z.string().max(50).default('draft').optional(),
  documentType: z.string().max(100).optional(),
  practiceArea: z.string().max(100).optional(),
  metadata:     z.record(z.string(), z.any()).default({}).optional(),
});

export type SelectLegalDocument = typeof legalDocuments.$inferSelect;
export type InsertLegalDocument = z.infer<typeof insertLegalDocumentSchema>;

// ── Chat Messages ─────────────────────────────────────────────────────────────

export const insertChatMessageSchema = z.object({
  sessionId: z.string().min(1).max(255),
  role:      z.enum(['user', 'assistant', 'system', 'tool']),
  content:   z.string().max(100_000),
});

export type SelectChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
