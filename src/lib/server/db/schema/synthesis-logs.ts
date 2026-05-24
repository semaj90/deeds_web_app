import { pgTable, jsonb } from 'drizzle-orm/pg-core';

export const synthesisLogs = pgTable("synthesis_logs", {
  id: integer("id").primaryKey(),
  runId: text("run_id").notNull().index("synthesis_logs_run_id"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  payload: jsonb("payload").notNull(),
  // Enrichment fields
  pathMapping: jsonb("path_mapping").default([]),
  dynamicImports: jsonb("dynamic_imports").default([]),
  runtimeDependencies: jsonb("runtime_dependencies").default([]),
  routeFlow: jsonb("route_flow").default([]),
  // Status/Audit
  status: text("status").default("COMPLETED").notNull(),
  sourceRefs: jsonb("source_refs").default([])
});