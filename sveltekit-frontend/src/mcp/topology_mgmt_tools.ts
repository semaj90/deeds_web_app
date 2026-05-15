import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pg from 'pg';

/**
 * Topology Management Tools (Read-Only/Planning)
 * Aligned with the corrected topology model which forbids heuristic in-route writes.
 */
export function registerTopologyMgmtTools(server: McpServer, pool: any) {
  
  // == topology.hydration_status ==============================================
  /**
   * Returns a diagnostic overview of topological hydration coverage.
   */
  server.registerTool(
    'topology.hydration_status',
    {
      description: 'Returns a diagnostic overview of topological hydration coverage.',
      inputSchema: z.object({})
    },
    async () => {
      try {
        const stats = await pool.query(`
          SELECT 
            (SELECT COUNT(*) FROM embedded_summaries) as total_rows,
            (SELECT COUNT(*) FROM embedded_summaries WHERE som_bmu_row IS NOT NULL AND som_bmu_col IS NOT NULL) as bmu_rows,
            (SELECT COUNT(*) FROM embedded_summaries WHERE manifold4 IS NOT NULL AND array_length(manifold4, 1) = 4) as manifold4_rows
        `).then((r: any) => r.rows[0]);

        const totalRows = Number(stats.total_rows || 0);
        const bmuRows = Number(stats.bmu_rows || 0);
        const manifold4Rows = Number(stats.manifold4_rows || 0);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              checkedAt: new Date().toISOString(),
              totalRows,
              bmuRows,
              manifold4Rows,
              missingBmu: totalRows - bmuRows,
              missingManifold4: totalRows - manifold4Rows,
              coverage: {
                bmu: totalRows > 0 ? (bmuRows / totalRows).toFixed(4) : "1.0000",
                manifold4: totalRows > 0 ? (manifold4Rows / totalRows).toFixed(4) : "1.0000"
              }
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // == topology.recompute_manifold_plan =======================================
  /**
   * Provides a recommended plan for restoring topological hydration.
   */
  server.registerTool(
    'topology.recompute_manifold_plan',
    {
      description: 'Provides a recommended plan for restoring topological hydration.',
      inputSchema: z.object({})
    },
    async () => {
      try {
        const stats = await pool.query(`
          SELECT 
            (SELECT COUNT(*) FROM embedded_summaries) as total_rows,
            (SELECT COUNT(*) FROM embedded_summaries WHERE som_bmu_row IS NOT NULL AND som_bmu_col IS NOT NULL) as bmu_rows,
            (SELECT COUNT(*) FROM embedded_summaries WHERE manifold4 IS NOT NULL AND array_length(manifold4, 1) = 4) as manifold4_rows
        `).then((r: any) => r.rows[0]);

        const totalRows = Number(stats.total_rows || 0);
        const bmuRows = Number(stats.bmu_rows || 0);
        const manifold4Rows = Number(stats.manifold4_rows || 0);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'Inline topology recompute is disabled. Use the canonical offline graphify pipeline.',
              reason: 'The repaired topology model forbids heuristic in-route 768d->4d projection writes.',
              currentMissing: {
                bmu: totalRows - bmuRows,
                manifold4: totalRows - manifold4Rows
              },
              recommendedSequence: [
                "npm run graphify:topology:gpu",
                "npm run qdrant:patch-topology",
                "npm run graphify:seed-llm-index"
              ],
              note: "Execute these commands via a terminal or an authorized ops tool."
            }, null, 2)
          }]
        };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
