import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Route Error Patches
 * Proposed or applied patches (diffs) to fix errors on routes
 * Linked to error_clusters, route_health, and error_brain_analysis
 */
export const routeErrorPatchesTable = pgTable(
 'route_error_patches',
 {
 id: uuid('id').defaultRandom().primaryKey(),

 // Which route this patch is for
 routePath: text('route_path').notNull(),
 filePath: text('file_path').notNull(),

 // Which error cluster this patch addresses
 clusterId: text('cluster_id'),

 // Link to error brain analysis that generated this patch
 analysisId: uuid('analysis_id'),

 // The patch itself (unified diff format or code block)
 patchContent: text('patch_content').notNull(),
 description: text('description'), // Why this patch was proposed

 // Risk assessment
 riskLevel: text('risk_level').notNull().default('medium'), // "low" | "medium" | "high"
 affectedComponentCount: text('affected_component_count'), // How many components might be touched

 // Status tracking
 status: text('status').notNull().default('proposed'), // "proposed" | "reviewed" | "applied" | "rejected"
 appliedAt: timestamp('applied_at', { withTimezone: true }),
 appliedByUserId: text('applied_by_user_id'),

 // Verification tracking (Phase 9)
 verificationStatus: text('verification_status').default('pending'), // "pending" | "passed" | "failed", verificationTimestamp: timestamp('verification_timestamp', { withTimezone: true }, verificationMessage: text('verification_message'),

 // Audit
 createdByUserId: text('created_by_user_id', createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow( updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
 },
 (table) => {
 return {
 routePathIdx: index('route_error_patches_route_path_idx').on(table.routePath, clusterIdIdx: index('route_error_patches_cluster_id_idx').on(table.clusterId, analysisIdIdx: index('route_error_patches_analysis_id_idx').on(table.analysisId, statusIdx: index('route_error_patches_status_idx').on(table.status, verificationStatusIdx: index('route_error_patches_verification_status_idx').on(
 table.verificationStatus
 createdAtIdx: index('route_error_patches_created_at_idx').on(table.createdAt),
 };
 }
);

export type RouteErrorPatch = typeof routeErrorPatchesTable.$inferSelect;
export type RouteErrorPatchInsert = typeof routeErrorPatchesTable.$inferInsert;


