const fs = require('fs');
const filePath = 'src/mcp/trace-mcp-server.ts';
const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

const newCode = \`server.tool(
  'kb.search_cards',
  {
    query: z.string().describe('Natural language query or symbol name'),
    limit: z.number().int().min(1).max(50).default(10),
    filters: z.record(z.string(), z.unknown()).optional(),
  },
  async ({ query, limit, filters }) => {
    const t0 = Date.now();
    const qHash = createHash('sha256').update(\\\`\${query}:\${limit}:\${JSON.stringify(filters ?? {})}\\\`).digest('hex').slice(0, 16);
    const cacheKey = \\\`kb:search:v2:\${qHash}\\\`;

    try {
      const redis = makeRedis();
      const cached = await redis.get(cacheKey).catch(() => null);
      await redis.quit();
      if (cached) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ...JSON.parse(cached), cached: true }, null, 2) }] };
      }
    } catch {}

    try {
      const results = await searchNotecards({
        query,
        limit,
        filters: filters as Parameters<typeof searchNotecards>[0]['filters'],
      });

      const out = {
        query,
        count: results.length,
        cards: results.map((hit) => ({
          chunk_id: hit.card_id,
          source_path: hit.source_path,
          score: hit.score,
          why: hit.why,
          kind: hit.kind,
          tags: hit.tags,
          rank_score: hit.rank_score,
          content: hit.context_text,
        })),
        elapsedMs: Date.now() - t0,
      };

      try {
        const redis = makeRedis();
        await redis.setex(cacheKey, 3600, JSON.stringify(out)).catch(() => {});
        await redis.quit();
      } catch {}

      return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
    }
  }
);

// == kb.search_notecards ======================================================

server.tool(
  'kb.search_notecards',
  {
    query: z.string().describe('Search across multiple notecard types (file, cluster, pathway)'),
    limit: z.number().int().default(10),
  },
  async ({ query, limit }) => {
    try {
      const client = await pool.connect();
      try {
        const summaryHits = await client.query(
          'SELECT chunk_id, summary_text as content, tags, \\'identity_spine\\' as type FROM embedded_summaries WHERE summary_text ILIKE $1 LIMIT $2',
          ['%' + query + '%', limit]
        );
        
        let pathwayHits = [];
        try {
          const res = await client.query(
            'SELECT pathway_id as chunk_id, summary as content, shared_tags as tags, pathway_type as type FROM graph_pathway_cards WHERE summary ILIKE $1 LIMIT $2',
            ['%' + query + '%', limit]
          );
          pathwayHits = res.rows;
        } catch (e) {
          try {
             const fs = await import('node:fs/promises');
             const data = await fs.readFile('memory/kb/notecards/pathway_cards.preview.jsonl', 'utf-8');
             pathwayHits = data.trim().split('\\\\n').map(l => JSON.parse(l))
               .filter(c => c.summary && c.summary.toLowerCase().includes(query.toLowerCase()))
               .map(c => ({ chunk_id: c.pathway_id, content: c.summary, tags: c.shared_tags || [], type: c.type }));
          } catch (err) {}
        }
        
        const merged = [...summaryHits.rows, ...pathwayHits].sort(() => 0.5 - Math.random()).slice(0, limit);
        return { content: [{ type: 'text' as const, text: JSON.stringify(merged, null, 2) }] };
      } finally {
        client.release();
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
    }
  }
);

// == kb.explain_context_pack ==================================================

server.tool(
  'kb.explain_context_pack',
  {
    cards: z.array(z.record(z.string(), z.unknown())).describe('List of cards currently in context'),
  },
  async ({ cards }) => {
    const types = cards.reduce((acc, c) => {
      const type = (c.type || c.kind || 'unknown');
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    
    const narrative = 'This context pack contains ' + cards.length + ' cards: ' + 
      Object.entries(types).map(([t, n]) => n + ' ' + t + 's').join(', ') + '.';
      
    return { content: [{ type: 'text' as const, text: JSON.stringify({ narrative, stats: types }, null, 2) }] };
  }
);\`;

// Replace lines 976 to 1108 (0-indexed: 975 to 1107)
lines.splice(975, 1108 - 976 + 1, newCode);

fs.writeFileSync(filePath, lines.join('\n'));
