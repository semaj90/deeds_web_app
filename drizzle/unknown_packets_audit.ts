// ----------------------------------------------------------------
// Phase 109: Unknown Packet Conceptual Tracking Schema (Mandated by Audit)
// This file defines a read-only audit table that tracks the cross-store
// identity and content provenance for packets whose full definition
// is not yet fully integrated into the primary source-of-truth tables.
// This table acts as a tracking mechanism for the audit process.
// ----------------------------------------------------------------

import { pgTable, text, timestamp, unique, integer, uuid, boolean, jsonb } from 'drizzle-orm/pg-core';

export const unknownPackets = pgTable('unknown_packets_audit', {
  // Primary identity is the key we are auditing.
  packetKey: text('packet_key').notNull(),
  // Core source tracking
  sourceRef: text('source_ref').notNull(),
  // Qdrant / Content Tracking
  qdrantPointId: text('qdrant_point_id').notNull().unique(),
  // The core data point that needs hashing/validation
  contentHash: text('content_hash').default(null),
  // Classification and Versioning
  ontologyVersion: text('ontology_version').default('UNKNOWN'),
  // Operational Status
  qdrantStatus: text('qdrant_status').default('UNKNOWN'), // e.g., 'MISSING', 'PRESENT_MATCH', 'MISMATCH'
  // Metadata
  workspaceFolder: text('workspace_id').default(null).optional(), // For lineage tracking
  lastValidatedAt: timestamp('last_validated_at').defaultNow(),
  // Additional auditing fields
  featureId: text('feature_id').default(null).optional(),
  domainClass: text('domain_class').default(null).optional(),
  // Composite unique index to prevent duplicate records for the same key/source pair
  primaryKey: 'UNIQUE (packet_key, source_ref)',
});