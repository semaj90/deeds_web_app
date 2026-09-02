/**
 * High-level Parent Atlas MCP façade.
 *
 * This layer exposes user-facing governed actions while delegating to the
 * existing read-only tool owners. It intentionally returns proposals only;
 * applying a patch remains outside MCP and requires explicit authorization.
 */
import { z } from 'zod';
import { agentProposeFixTool } from './vault-walker.tool.js';

export const atlasPlanRepairTool = {
  name: 'atlas.planRepair',
  description:
    'Trace a suspected repository error and return a read-only repair proposal. ' +
    'Uses existing Parent Atlas evidence owners; never edits files or applies patches.',
  parameters: z.object({
    file_path: z.string().min(1).describe('Repo-relative file path suspected to own the issue'),
    issue: z.string().min(1).describe('Observed error or requested repair, without hidden reasoning'),
  }),
  execute: async (args: { file_path: string; issue: string }) => {
    const result = await agentProposeFixTool.execute(args);
    return typeof result === 'string' ? result : JSON.stringify(result);
  },
} as const;

