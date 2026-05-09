const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/mcp/trace-mcp-server.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Update hypergraph.semantic_path_synthesis
const hyperStart = content.indexOf('// == hypergraph.semantic_path_synthesis');
const hyperEnd = content.indexOf('// ── HTTP server with /health');

if (hyperStart !== -1 && hyperEnd !== -1) {
    const newHyperTools = `// == hypergraph.semantic_path_synthesis =======================================

server.tool(
  'hypergraph.semantic_path_synthesis',
  {
    startKey: z.string().describe('Starting node stableKey'),
    endKey:   z.string().describe('Target node stableKey'),
    maxHops:  z.number().int().min(1).max(5).default(3).describe('Maximum hyperedge hops'),
  },
  async ({ startKey, endKey, maxHops }) => {
    try {
      const rows = await neo4jQuery(
        \\\`MATCH p = shortestPath((a {stableKey: $start})-[*..\\\${maxHops * 2}]-(b {stableKey: $end}))
         WHERE ALL(n IN nodes(p) WHERE n:CodebaseFile OR n:Hyperedge OR n:GPUCluster OR n:Community OR n:VaultNote)
         RETURN [n IN nodes(p) | { key: n.stableKey, label: labels(n)[0], name: n.name, zone: n.zone }] AS path,
                length(p) AS hops\\\`,
        { start: startKey, end: endKey }
      );
      
      if (!rows.length || !rows[0].row) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ message: 'No hypergraph path found' }) }] };
      }
      
      const pathData = rows[0].row[0];
      const hops = rows[0].row[1];

      const hyperedges = pathData.filter(n => n.label !== 'CodebaseFile').map(n => n.key || n.name);
      const lanes = Array.from(new Set(pathData.map(n => n.zone).filter(Boolean)));
      
      const summary = \\\`Cross-domain hypergraph path found connecting \\\${startKey} and \\\${endKey} via \\\${hyperedges.join(', ')} in zones \\\${lanes.join(', ')}.\\\`;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            type: "hyper_pathway_card",
            startKey, endKey,
            hypergraphHops: hops / 2,
            lanes,
            hyperedges,
            summary,
            confidence: hops <= 4 ? "high" : "medium",
            path: pathData
          }, null, 2)
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
    }
  }
);

// == hypergraph.materialize_pathway ===========================================

server.tool(
  'hypergraph.materialize_pathway',
  {
    startKey: z.string().describe('Starting node stableKey'),
    endKey:   z.string().describe('Target node stableKey'),
    pathResult: z.record(z.string(), z.unknown()).optional().describe('Optional prior hypergraph.semantic_path_synthesis result'),
    dryRun: z.boolean().default(true).describe('If true, only returns the card without inserting'),
    confirmMaterialize: z.boolean().default(false).describe('Must be true if dryRun is false to perform actual DB insert'),
  },
  async ({ startKey, endKey, pathResult, dryRun, confirmMaterialize }) => {
    try {
      let resultData = pathResult;
      if (!resultData || Object.keys(resultData).length === 0) {
        const handler = toolRegistry.get('hypergraph.semantic_path_synthesis');
        if (!handler) throw new Error('hypergraph.semantic_path_synthesis not found in registry');
        const rawRes = await handler({ startKey, endKey, maxHops: 3 });
        resultData = JSON.parse(rawRes.content?.[0]?.text || '{}');
      }

      if (resultData.error || resultData.message === 'No hypergraph path found') {
         return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Could not synthesize hyper-path', details: resultData }) }] };
      }

      const { createHash } = await import('node:crypto');
      const fs = await import('node:fs/promises');
      
      const sName = startKey.split('/').pop() || 'start';
      const eName = endKey.split('/').pop() || 'end';
      const hashInput = JSON.stringify(resultData);
      const sHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 12);
      
      const pathwayId = \\\`hyperpath:\${sName}-to-\${eName}:\${sHash}\\\`;
      
      const pathwayCard = {
        type: "hyper_pathway_card",
        pathway_id: pathwayId,
        title: \\\`\${sName} to \${eName} hyper-pathway\\\`,
        start_key: startKey,
        end_key: endKey,
        lanes: resultData.lanes || [],
        hyperedges: resultData.hyperedges || [],
        summary: resultData.summary || 'No summary provided',
        confidence: resultData.confidence || 'unknown',
        source_hashes: [sHash],
        created_at: new Date().toISOString()
      };

      if (dryRun) {
        await fs.mkdir('memory/kb/notecards', { recursive: true });
        await fs.appendFile('memory/kb/notecards/pathway_cards.preview.jsonl', JSON.stringify(pathwayCard) + '\\\\n');
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
          \\\`INSERT INTO graph_pathway_cards 
           (pathway_id, pathway_type, start_key, end_key, node_keys, edge_kinds, summary, source_hash, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (pathway_id) DO UPDATE
           SET summary = EXCLUDED.summary,
               metadata = EXCLUDED.metadata\\\`,
          [
            pathwayCard.pathway_id,
            pathwayCard.type,
            pathwayCard.start_key,
            pathwayCard.end_key,
            pathwayCard.hyperedges, // store hyperedges as node_keys for now or in metadata
            pathwayCard.lanes,      // store lanes as edge_kinds
            pathwayCard.summary,
            pathwayCard.source_hashes[0],
            JSON.stringify(pathwayCard)
          ]
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ message: 'Hyper-pathway successfully materialized.', card: pathwayCard }, null, 2)
          }]
        };
      } catch (e) {
        if (e.code === '42P01') {
          await fs.mkdir('memory/kb/notecards', { recursive: true });
          await fs.appendFile('memory/kb/notecards/pathway_cards.preview.jsonl', JSON.stringify(pathwayCard) + '\\\\n');
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                card: pathwayCard,
                warning: 'Table graph_pathway_cards does not exist. Degraded to local JSONL output.'
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
);

// == graph.search_pathway_cards ===============================================

server.tool(
  'graph.search_pathway_cards',
  {
    query: z.string().optional().describe('Text search across pathway summaries'),
    startKey: z.string().optional(),
    endKey: z.string().optional(),
    type: z.enum(['pathway_card', 'hyper_pathway_card']).optional(),
  },
  async ({ query, startKey, endKey, type }) => {
    try {
      const client = await pool.connect();
      try {
        let sql = \\\`SELECT * FROM graph_pathway_cards WHERE 1=1\\\`;
        const params = [];
        if (query) {
          params.push(\\\`%\${query}%\\\`);
          sql += \\\` AND summary ILIKE $\\\${params.length}\\\`;
        }
        if (startKey) {
          params.push(startKey);
          sql += \\\` AND start_key = $\\\${params.length}\\\`;
        }
        if (endKey) {
          params.push(endKey);
          sql += \\\` AND end_key = $\\\${params.length}\\\`;
        }
        if (type) {
          params.push(type);
          sql += \\\` AND pathway_type = $\\\${params.length}\\\`;
        }
        
        const res = await client.query(sql, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(res.rows, null, 2) }] };
      } catch (e) {
        if (e.code === '42P01') {
           // Fallback to local preview if DB missing
           const fs = await import('node:fs/promises');
           try {
             const data = await fs.readFile('memory/kb/notecards/pathway_cards.preview.jsonl', 'utf-8');
             const cards = data.trim().split('\\\\n').map(l => JSON.parse(l));
             const filtered = cards.filter(c => {
               if (type && c.type !== type) return false;
               if (startKey && c.start_key !== startKey) return false;
               if (endKey && c.end_key !== endKey) return false;
               if (query && !c.summary.toLowerCase().includes(query.toLowerCase())) return false;
               return true;
             });
             return { content: [{ type: 'text' as const, text: JSON.stringify(filtered, null, 2) }] };
           } catch (err) {
             return { content: [{ type: 'text' as const, text: '[]' }] };
           }
        }
        throw e;
      } finally {
        client.release();
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
    }
  }
);

`;
    content = content.slice(0, hyperStart) + newHyperTools + content.slice(hyperEnd);
    fs.writeFileSync(filePath, content);
    console.log('Updated hypergraph tools and added search');
} else {
    console.error('Could not find hypergraph markers');
}
