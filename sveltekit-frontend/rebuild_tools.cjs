const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/mcp/trace-mcp-server.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Update graph.topological_sort
const topoSortStart = content.indexOf('// == graph.topological_sort');
const topoSortEnd = content.indexOf('// ── graph.community_for_node');

if (topoSortStart !== -1 && topoSortEnd !== -1) {
    const newTopoSort = `// == graph.topological_sort ===================================================

server.tool(
  'graph.topological_sort',
  {
    stableKeys: z.array(z.string()).describe('List of stableKeys to sort based on dependencies'),
    rankTieBreak: z.boolean().default(true).describe('Use pageRankScore and riskScore to tie-break'),
  },
  async ({ stableKeys, rankTieBreak }) => {
    try {
      const uniqueKeys = Array.from(new Set(stableKeys));
      if (uniqueKeys.length === 0) return { content: [{ type: 'text' as const, text: '[]' }] };
      
      const rows = await neo4jQuery(
        \`MATCH (a)-[r:imports_static|imports_dynamic|depends_on]->(b)
         WHERE a.stableKey IN $keys AND b.stableKey IN $keys
         RETURN a.stableKey AS from, b.stableKey AS to\`,
        { keys: uniqueKeys }
      );
      
      const ranks = await neo4jQuery(
        \`MATCH (n) WHERE n.stableKey IN $keys
         RETURN n.stableKey AS key, coalesce(n.pageRankScore, 0) AS pageRank, coalesce(n.riskScore, 0) AS riskScore\`,
        { keys: uniqueKeys }
      );
      
      const rankMap = new Map();
      for (const r of ranks) {
        rankMap.set(r.row[0], { pageRank: r.row[1], riskScore: r.row[2] });
      }

      const compareKeys = (a, b) => {
        if (rankTieBreak) {
          const ra = rankMap.get(a) ?? { pageRank: 0, riskScore: 0 };
          const rb = rankMap.get(b) ?? { pageRank: 0, riskScore: 0 };
          if (rb.pageRank !== ra.pageRank) return rb.pageRank - ra.pageRank;
          if (rb.riskScore !== ra.riskScore) return rb.riskScore - ra.riskScore;
        }
        return a.localeCompare(b);
      };
      
      const adj = new Map();
      const inDegree = new Map();
      
      for (const k of uniqueKeys) {
        adj.set(k, []);
        inDegree.set(k, 0);
      }
      
      for (const row of rows) {
        const from = row.row[0];
        const to = row.row[1];
        if (adj.has(from) && adj.has(to)) {
          adj.get(from).push(to);
          inDegree.set(to, inDegree.get(to) + 1);
        }
      }
      
      let queue = uniqueKeys.filter(k => inDegree.get(k) === 0).sort(compareKeys);
      
      const ordered = [];
      const tiers = [];
      let currentTierIndex = 0;

      while (queue.length > 0) {
        const tierNodes = [...queue];
        tiers.push({ tier: currentTierIndex, nodes: tierNodes });
        
        const nextQueue = [];
        for (const u of tierNodes) {
          const r = rankMap.get(u) ?? { pageRank: 0, riskScore: 0 };
          ordered.push({
            stableKey: u,
            tier: currentTierIndex,
            page_rank_score: r.pageRank,
            risk_score: r.riskScore,
            why_first: rankTieBreak ? 'highest authority/risk among zero-in-degree nodes in this tier' : undefined
          });

          for (const v of adj.get(u)) {
            inDegree.set(v, inDegree.get(v) - 1);
            if (inDegree.get(v) === 0) {
              nextQueue.push(v);
            }
          }
        }
        queue = nextQueue.sort(compareKeys);
        currentTierIndex++;
      }
      
      const orderedKeys = new Set(ordered.map(o => o.stableKey));
      const cycles = uniqueKeys.filter(k => !orderedKeys.has(k)).sort(compareKeys);
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ordered,
            tiers,
            cycles,
            tie_breaker: rankTieBreak ? 'page_rank_score desc, risk_score desc, stableKey asc' : 'stableKey asc',
            scores_used: rankTieBreak ? ['pageRankScore', 'riskScore'] : []
          }, null, 2)
        }]
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
    }
  }
);

`;
    content = content.slice(0, topoSortStart) + newTopoSort + content.slice(topoSortEnd);
    console.log('Updated graph.topological_sort');
} else {
    console.error('Could not find graph.topological_sort markers');
}

// 2. Update graph.materialize_pathway
const matStart = content.indexOf('// == graph.materialize_pathway');
const matEnd = content.indexOf('// == hypergraph.semantic_path_synthesis');

if (matStart !== -1 && matEnd !== -1) {
    const newMat = `// == graph.materialize_pathway ================================================

server.tool(
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
      let resultData = pathResult;
      if (!resultData || Object.keys(resultData).length === 0) {
        const handler = toolRegistry.get('graph.semantic_path_synthesis');
        if (!handler) throw new Error('semantic_path_synthesis not found in registry');
        const rawRes = await handler({ startKey, endKey, maxHops: 6 });
        resultData = JSON.parse(rawRes.content?.[0]?.text || '{}');
      }

      if (resultData.error || resultData.message === 'No topological path found') {
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
        title: \`\${sName} to \${eName} pathway\`,
        start_key: startKey,
        end_key: end_key,
        nodes: resultData.pathSteps?.map((s) => s.stableKey) || [],
        edges: resultData.pathSteps?.map((s) => s.connectsToNextVia).filter(Boolean) || [],
        summary: resultData.derivedOutcomes?.narrative || 'No narrative provided',
        shared_tags: resultData.derivedOutcomes?.sharedSemanticTags || [],
        cross_cluster_leaps: resultData.derivedOutcomes?.crossesClusters ? 1 : 0,
        risk_score: 0,
        page_rank_score: 0,
        source_hashes: [sHash],
        kb_snapshot_hash: resultData.kb_snapshot_hash || null,
        metadata: resultData.derivedOutcomes || {},
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
           (pathway_id, pathway_type, start_key, end_key, node_keys, edge_kinds, summary, shared_tags, risk_score, page_rank_score, source_hash, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (pathway_id) DO UPDATE
           SET summary = EXCLUDED.summary,
               shared_tags = EXCLUDED.shared_tags,
               metadata = EXCLUDED.metadata\`,
          [
            pathwayCard.pathway_id,
            pathwayCard.type,
            pathwayCard.start_key,
            pathwayCard.end_key,
            pathwayCard.nodes,
            pathwayCard.edges,
            pathwayCard.summary,
            pathwayCard.shared_tags,
            pathwayCard.risk_score,
            pathwayCard.page_rank_score,
            pathwayCard.source_hashes[0],
            JSON.stringify(pathwayCard.metadata)
          ]
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ message: 'Pathway successfully materialized to graph_pathway_cards table.', card: pathwayCard }, null, 2)
          }]
        };
      } catch (e) {
        if (e.code === '42P01') {
          // Table does not exist
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
);

`;
    content = content.slice(0, matStart) + newMat + content.slice(matEnd);
    console.log('Updated graph.materialize_pathway');
} else {
    console.error('Could not find graph.materialize_pathway markers');
}

fs.writeFileSync(filePath, content);
