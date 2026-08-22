import { z } from 'zod';
import {
  CodeRevisionAuthorityColumnV1Schema,
  type CodeRevisionAuthorityColumnV1,
} from './code-revision-authority-v1.js';

export const GraphifySourceInventoryWritePlanV1Schema = z.object({
  schemaVersion: z.literal('graphify-source-inventory-write-plan-v1'),
  targetTable: z.literal('graphify_files'),
  sourceRevisionAuthorityColumn: CodeRevisionAuthorityColumnV1Schema,
  legacySourceRevisionColumn: z.literal('source_revision'),
  preservesLegacySourceRevisionSemantics: z.literal(true),
  writesAreAuthorized: z.literal(false),
  requiresReadbackCanary: z.literal(true),
}).strict();

export type GraphifySourceInventoryWritePlanV1 = z.infer<typeof GraphifySourceInventoryWritePlanV1Schema>;

export function buildGraphifySourceInventoryWritePlan(
  authorityColumn: CodeRevisionAuthorityColumnV1,
): GraphifySourceInventoryWritePlanV1 {
  return GraphifySourceInventoryWritePlanV1Schema.parse({
    schemaVersion: 'graphify-source-inventory-write-plan-v1',
    targetTable: 'graphify_files',
    sourceRevisionAuthorityColumn: authorityColumn,
    legacySourceRevisionColumn: 'source_revision',
    preservesLegacySourceRevisionSemantics: true,
    writesAreAuthorized: false,
    requiresReadbackCanary: true,
  });
}
