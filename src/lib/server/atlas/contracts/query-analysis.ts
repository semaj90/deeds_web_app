import { z } from 'zod';

export const atlasIntentSchema = z.enum([
  'fix_error',
  'diagnose',
  'find_todo',
  'trace_telemetry',
  'retrieve_memory',
  'hybrid_search',
]);

export const atlasSearchModeSchema = z.enum([
  'exact',
  'sparse',
  'semantic',
  'graph',
  'telemetry',
  'hybrid',
]);

export const queryAnalysisSchema = z.object({
  query: z.string().min(1),
  normalized_query: z.string().min(1),
  intent: atlasIntentSchema,
  mode: atlasSearchModeSchema,
  identifiers: z.array(z.string()).default([]),
  paths: z.array(z.string()).default([]),
  error_codes: z.array(z.string()).default([]),
  exact_phrases: z.array(z.string()).default([]),
  entity_hints: z.array(z.string()).default([]),
  top_k: z.number().int().positive().default(20),
  traversal_depth: z.number().int().nonnegative().default(2),
});

export type AtlasIntent = z.infer<typeof atlasIntentSchema>;
export type AtlasSearchMode = z.infer<typeof atlasSearchModeSchema>;
export type QueryAnalysis = z.infer<typeof queryAnalysisSchema>;

