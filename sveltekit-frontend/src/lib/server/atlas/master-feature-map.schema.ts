/**
 * src/lib/server/atlas/master-feature-map.schema.ts
 * 
 * Zod schema for the Manifold4 Master Feature Map.
 * Ensures every architectural feature has truthful status and provenance.
 */

import { z } from 'zod';

export const FeatureStatusSchema = z.enum([
  'active',
  'partial',
  'dry_run',
  'planned',
  'research_spike',
  'deprecated'
]);

export const FeatureEvidenceSchema = z.object({
  files: z.array(z.string()).describe('Existing source files for this feature'),
  tests: z.array(z.string()).optional().describe('Unit or integration tests'),
  smoke: z.array(z.string()).optional().describe('Smoke test scripts'),
  lastValidatedAt: z.string().optional().describe('ISO timestamp of last validation')
});

export const MasterFeatureEntrySchema = z.object({
  id: z.string().describe('Unique feature identifier (kebab-case)'),
  name: z.string().describe('Human-readable feature name'),
  intent: z.string().describe('Architectural intent of the feature'),
  service: z.string().describe('Main service or orchestrator name'),
  stores: z.array(z.string()).describe('Datastores used (Redis, Qdrant, Neo4j, etc.)'),
  modules: z.array(z.string()).optional().describe('Primary modules and packages used by the feature'),
  imports: z.array(z.string()).optional().describe('Canonical import targets and shared dependencies'),
  dependencies: z.array(z.string()).optional().describe('Explicit dependency chain labels or file groups'),
  languages: z.array(z.string()).optional().describe('Primary implementation languages involved'),
  networking: z.array(z.string()).optional().describe('Network protocols, APIs, and transport layers'),
  offlineProcessing: z.array(z.string()).optional().describe('Offline processing lanes such as DuckDB or CouchDB'),
  cache: z.array(z.string()).optional().describe('Cache layers and cache-related components'),
  inferenceFallbacks: z.array(z.string()).optional().describe('Fallback inference lanes and degraded paths'),
  clusters: z.array(z.number()).describe('Topological cluster IDs associated with this feature'),
  status: FeatureStatusSchema,
  params: z.record(z.string(), z.any()).default({}),
  pathMapping: z.array(z.string()).optional().describe('Relevant repository paths'),
  evidence: FeatureEvidenceSchema.optional(),
  failOpen: z.boolean().default(true).describe('Whether the system should continue if this feature fails')
});

export const MasterFeatureMapSchema = z.record(z.string(), MasterFeatureEntrySchema);
