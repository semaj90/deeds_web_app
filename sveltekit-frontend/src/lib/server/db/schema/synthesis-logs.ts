import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const synthesisLogs = pgTable("synthesis_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: text("run_id").notNull(),
  queryHash: text("query_hash"),
  sourceStage: text("source_stage").notNull(),
  selectedNodes: jsonb("selected_nodes").notNull().default([]),
  selectedEdges: jsonb("selected_edges").notNull().default([]),
  selectedClusters: jsonb("selected_clusters").notNull().default([]),
  pathMapping: jsonb("path_mapping").notNull().default([]),
  dynamicImports: jsonb("dynamic_imports").notNull().default([]),
  protocols: jsonb("protocols").notNull().default([]),
  cacheLayerUsed: text("cache_layer_used").notNull().default('none'),
  cacheTrace: jsonb("cache_trace").notNull().default({}),
  manifold4: jsonb("manifold4").notNull().default({}),
  summary: text("summary"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
