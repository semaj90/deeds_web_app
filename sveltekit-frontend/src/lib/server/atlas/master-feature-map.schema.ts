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
  clusters: z.array(z.number()).describe('Topological cluster IDs associated with this feature'),
  status: FeatureStatusSchema,
  params: z.record(z.any()).default({}),
  pathMapping: z.array(z.string()).optional().describe('Relevant repository paths'),
  evidence: FeatureEvidenceSchema.optional(),
  failOpen: z.boolean().default(true).describe('Whether the system should continue if this feature fails')
});

export const MasterFeatureMapSchema = z.record(z.string(), MasterFeatureEntrySchema);
