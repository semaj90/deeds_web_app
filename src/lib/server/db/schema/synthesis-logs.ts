import { pgTable, text, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core';

export const synthesisLogs = pgTable(
  'synthesis_logs',
  {
    id: integer('id').primaryKey(),
    runId: text('run_id').notNull(),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    // Enrichment fields
    pathMapping: jsonb('path_mapping').$type<string[]>().default([]).notNull(),
    dynamicImports: jsonb('dynamic_imports').$type<string[]>().default([]).notNull(),
    runtimeDependencies: jsonb('runtime_dependencies').$type<string[]>().default([]).notNull(),
    routeFlow: jsonb('route_flow').$type<string[]>().default([]).notNull(),
    // Status/Audit
    status: text('status').default('COMPLETED').notNull(),
    sourceRefs: jsonb('source_refs').$type<string[]>().default([]).notNull(),
  },
  (table) => ({
    runIdIdx: index('synthesis_logs_run_id_idx').on(table.runId),
  })
);