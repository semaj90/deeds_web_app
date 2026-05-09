const fs = require('fs');

let content = fs.readFileSync('src/mcp/trace-mcp-server.ts', 'utf-8');

const oldTool = `server.tool(
  'graph.materialize_pathway',
  {
    startKey: z.string().describe('Starting node stableKey'),
    endKey:   z.string().describe('Target node stableKey'),
    pathSteps: z.array(z.record(z.string(), z.unknown())).describe('The synthesized path steps to materialize'),
    narrative: z.string().describe('The synthesized narrative to store'),
    tags: z.array(z.string()).describe('Shared semantic tags'),
  },
  async ({ startKey, endKey, pathSteps, narrative, tags }) => {
    try {
      const pathwayId = \`pathway:\${startKey}:\${endKey}\`;
      
      const client = await pool.connect();
      try {
        await client.query(
          \`INSERT INTO embedded_summaries 
           (chunk_id, source_type, source_hash, summary_type, summary_text, summary_json, tags, output_meta, model, embedding_model, qdrant_collection)
           VALUES ($1, 'pathway', $2, 'algorithmic_narrative', $3, $4, $5, $6, 'mcp-algorithmic', 'none', 'none')
           ON CONFLICT (chunk_id, source_hash, summary_type) DO UPDATE
           SET summary_text = EXCLUDED.summary_text,
               summary_json = EXCLUDED.summary_json,
               tags = EXCLUDED.tags\`,
          [
            pathwayId,
            pathwayId,
            narrative,
            JSON.stringify({ steps: pathSteps }),
            tags,
            JSON.stringify({ generatedBy: 'graph.materialize_pathway', type: 'composite' })
          ]
        );
      } finally {
        client.release();
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            message: 'Pathway successfully materialized to embedded_summaries graph memory.',
            pathwayId
          }, null, 2)
        }]
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
    }
  }
);`;

const newTool = `server.tool(
  'graph.materialize_pathway',
  {
    startKey: z.string().describe('Starting node stableKey'),
    endKey:   z.string().describe('Target node stableKey'),
    pathResult: z.record(z.string(), z.unknown()).optional().describe('Optional prior graph.semantic_path_synthesis result'),
    dryRun: z.boolean().default(true).describe('If true, only returns the card without inserting'),
    confirmMaterialize: z.boolean().default(false).describe('Must be true if dryRun is false to perform actual DB insert'),
  },
  async ({ startKey, endKey, pathResult, dryRun, confirmMaterialize }) => {
    try {
      let resultData: any = pathResult;
      if (!resultData || Object.keys(resultData).length === 0) {
        const handler = toolRegistry.get('graph.semantic_path_synthesis');
        if (!handler) throw new Error('semantic_path_synthesis not found in registry');
        const rawRes = await handler({ startKey, endKey, maxHops: 6 }) as { content?: {text: string}[] };
        resultData = JSON.parse(rawRes.content?.[0]?.text || '{}');
      }

      if (resultData.error || resultData.message) {
         return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Could not synthesize path', details: resultData }) }] };
      }

      const { createHash } = await import('node:crypto');
      const fs = await import('node:fs/promises');
      
      const sName = startKey.split('/').pop() || 'start';
      const eName = endKey.split('/').pop() || 'end';
      const hashInput = JSON.stringify(resultData);
      const sHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 12);
      
      const pathwayId = \`pathway:\${sName}-to-\${eName}:\${sHash}\`;
      
      const pathwayCard = {
        type: "pathway_card",
        pathway_id: pathwayId,
        start_key: startKey,
        end_key: endKey,
        node_keys: resultData.pathSteps?.map((s:any) => s.stableKey) || [],
        edge_kinds: resultData.pathSteps?.map((s:any) => s.connectsToNextVia).filter(Boolean) || [],
        summary: resultData.derivedOutcomes?.narrative || 'No narrative provided',
        shared_tags: resultData.derivedOutcomes?.sharedSemanticTags || [],
        cross_cluster_leaps: resultData.derivedOutcomes?.crossesClusters ? 1 : 0,
        risk_score: 0,
        page_rank_score: 0,
        source_hash: sHash,
        created_at: new Date().toISOString()
      };

      if (dryRun) {
        await fs.mkdir('memory/kb/notecards', { recursive: true });
        await fs.appendFile('memory/kb/notecards/pathway_cards.preview.jsonl', JSON.stringify(pathwayCard) + '\\n');
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ message: 'Dry run complete. Saved to preview jsonl.', card: pathwayCard }, null, 2)
          }]
        };
      }

      if (!confirmMaterialize) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'confirmMaterialize must be true when dryRun is false' }) }], isError: true };
      }

      const client = await pool.connect();
      try {
        await client.query(
          \`INSERT INTO graph_pathway_cards 
           (pathway_id, pathway_type, start_key, end_key, node_keys, edge_kinds, summary, shared_tags, risk_score, page_rank_score, source_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (pathway_id) DO UPDATE
           SET summary = EXCLUDED.summary,
               shared_tags = EXCLUDED.shared_tags\`,
          [
            pathwayCard.pathway_id,
            pathwayCard.type,
            pathwayCard.start_key,
            pathwayCard.end_key,
            pathwayCard.node_keys,
            pathwayCard.edge_kinds,
            pathwayCard.summary,
            pathwayCard.shared_tags,
            pathwayCard.risk_score,
            pathwayCard.page_rank_score,
            pathwayCard.source_hash
          ]
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ message: 'Pathway successfully materialized to graph_pathway_cards table.', card: pathwayCard }, null, 2)
          }]
        };
      } catch (e: any) {
        if (e.code === '42P01') {
          // undefined_table
          await fs.mkdir('memory/kb/notecards', { recursive: true });
          await fs.appendFile('memory/kb/notecards/pathway_cards.preview.jsonl', JSON.stringify(pathwayCard) + '\\n');
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                card: pathwayCard,
                warning: 'Table graph_pathway_cards does not exist. Degraded to local JSONL output in memory/kb/notecards/pathway_cards.preview.jsonl',
                migration: \`CREATE TABLE graph_pathway_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pathway_id text UNIQUE NOT NULL,
  pathway_type text NOT NULL,
  start_key text NOT NULL,
  end_key text NOT NULL,
  node_keys text[] NOT NULL,
  edge_kinds text[] NOT NULL,
  summary text NOT NULL,
  shared_tags text[] DEFAULT '{}',
  risk_score double precision DEFAULT 0,
  page_rank_score double precision DEFAULT 0,
  kb_snapshot_hash text,
  source_hash text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);\`
              }, null, 2)
            }]
          };
        }
        throw e;
      } finally {
        client.release();
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
    }
  }
);`;

if (!content.includes(oldTool)) {
  console.log("Could not find the old tool to replace");
} else {
  content = content.replace(oldTool, newTool);
  fs.writeFileSync('src/mcp/trace-mcp-server.ts', content);
  console.log("Replaced successfully");
}
