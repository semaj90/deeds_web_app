import { z } from 'zod';

/**
 * Trust tiers for the retrieval/generation source, aligning with the project's Docs Ingestion Governance.
 * - local_code (Authoritative): Sourced directly from the codebase.
 * - official_docs (High Trust): Sourced from validated official documentation.
 * - external_unverified (Web/Low Trust): Web search results or unverified external sources.
 */
export const trustTierEnum = z.enum([
  'local_code',
  'official_docs',
  'external_unverified'
]);

/**
 * SharedLabelSchema
 * 
 * A unified Zod validation contract for labels used across JSONB (PostgreSQL), 
 * Qdrant payloads, Redis cluster tags, and ACE packets.
 * 
 * This effectively "labels" the audit process itself by enforcing that findings
 * include necessary references, commands, and trust tiers.
 */
export const SharedLabelSchema = z.object({
  /** Unique identifier for the label/finding */
  id: z.string().uuid().optional(),

  /** The core label text, tag, or finding name */
  name: z.string().trim().min(1).max(255),

  /** Category/Type of label (e.g., 'audit_finding', 'ai_tag', 'user_tag', 'schema_mismatch') */
  type: z.string().max(100).default('general'),

  /** Trust hierarchy level */
  trustTier: trustTierEnum.default('external_unverified'),

  /** System component, AI model, or user ID that generated this label */
  source: z.string().max(255).optional(),

  /** AI confidence score (0.0 to 1.0) */
  confidence: z.number().min(0).max(1).optional(),

  // === Contract Audit Fields ===
  /** Authoritative local source references (e.g., Docs Atlas, file paths) */
  localSourceRefs: z.array(z.string()).default([]),

  /** Web or official documentation references */
  externalDocRefs: z.array(z.string()).default([]),

  /** A description of the suggested fix if this label represents an audit finding */
  suggestedFix: z.string().optional(),

  /** The npm run command or validation command to verify the fix */
  validationCommand: z.string().max(255).optional(),
  // =============================

  /** Indicates if this label has been manually confirmed by an operator */
  isConfirmed: z.boolean().default(false),

  /** Extensible payload for custom index requirements or ACE packet data */
  metadata: z.record(z.string(), z.any()).default({}),

  /** ISO 8601 timestamp to track client/server data drift and label creation */
  timestamp: z.string().datetime().optional()
});

export type SharedLabel = z.infer<typeof SharedLabelSchema>;
export type TrustTier = z.infer<typeof trustTierEnum>;
