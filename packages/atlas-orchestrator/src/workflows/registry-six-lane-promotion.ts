/**
 * Workflow: Registry Six-Lane Promotion
 *
 * Orchestrates the complete lifecycle to raise registry topology lane from 1.85% to ~50%:
 * 1. Audit validator contract and registry joins
 * 2. Compute PageRank via Neo4j GDS + NetworkX
 * 3. Materialize cheap lanes (structural, lexical, domain)
 * 4. Materialize topology identity
 * 5. Rerun validator
 * 6. Generate delta report
 */

import { Mastra, Agent } from '@mastra/core';
import { z } from 'zod';

export const registrySixLanePromotionWorkflow = {
  name: 'registry-six-lane-promotion',
  description: 'Complete workflow to raise registry topology and other lanes to operational readiness',
  version: '1.0.0',

  // Input schema
  input: z.object({
    registryPath: z.string().default('docs/atlas/feature-registry.json'),
    limitPackets: z.number().default(4209).describe('Max packets to materialize per lane'),
    enablePageRank: z.boolean().default(true).describe('Compute and materialize PageRank'),
    dryRun: z.boolean().default(true).describe('Dry-run mode (no writes)'),
  }),

  // Workflow stages
  stages: [
    {
      name: 'audit-validator-contract',
      description: 'Verify validator contract and registry join counts',
      script: 'scripts/atlas/audit-registry-enrichment-joins.mjs',
    },
    {
      name: 'compute-pagerank',
      description: 'Neo4j GDS → NetworkX → Postgres pagerank materialization',
      script: 'scripts/atlas/compute-pagerank-gds.mjs',
      enabled: 'input.enablePageRank',
    },
    {
      name: 'materialize-cheap-lanes',
      description: 'Project lexical, structural, domain evidence to packets',
      script: 'scripts/atlas/materialize-packet-cheap-lanes.mjs',
    },
    {
      name: 'materialize-topology-identity',
      description: 'Project topology coordinates and pagerank to aligned registry rows',
      script: 'scripts/atlas/materialize-feature-registry-alignment.mjs',
    },
    {
      name: 'validate-six-lanes',
      description: 'Rerun validator on aligned registry',
      script: 'scripts/atlas/validate-feature-set-alignment.mjs',
    },
    {
      name: 'build-delta-report',
      description: 'Compare before/after metrics and generate report',
      script: 'scripts/atlas/build-registry-promotion-delta.mjs',
    },
  ],
};

export interface RegistrySixLanePromotionInput {
  registryPath?: string;
  limitPackets?: number;
  enablePageRank?: boolean;
  dryRun?: boolean;
}

export interface RegistrySixLanePromotionResult {
  status: 'success' | 'partial' | 'failed';
  stagesCompleted: string[];
  metrics: {
    beforeLaneScores: Record<string, number>;
    afterLaneScores: Record<string, number>;
    registryAlignmentCoverage: number;
    topologyReadyCount: number;
  };
  report: string;
}
