const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/mcp/trace-mcp-server.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// Insert after kb.search_cards block
const searchCardsEnd = content.indexOf('  },', content.indexOf("'kb.search_cards'")) + 5; 
// Wait, that's not robust enough. Let's find the closing ); of kb.search_cards
const searchCardsBlockEnd = content.indexOf(');', content.indexOf("'kb.search_cards'")) + 2;

const kbTools = `
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
          \\\`SELECT chunk_id, summary_text as content, tags, 'identity_spine' as type 
           FROM embedded_summaries 
           WHERE summary_text ILIKE $1 
           LIMIT $2\\\`,
          [\\\`%\${query}%\\\`, limit]
        );
        
        let pathwayHits = [];
        try {
          const res = await client.query(
            \\\`SELECT pathway_id as chunk_id, summary as content, shared_tags as tags, pathway_type as type 
             FROM graph_pathway_cards 
             WHERE summary ILIKE $1 
             LIMIT $2\\\`,
            [\\\`%\${query}%\\\`, limit]
          );
          pathwayHits = res.rows;
        } catch (e) {
          // Handle missing table by checking local preview if exists
          try {
             const fs = await import('node:fs/promises');
             const data = await fs.readFile('memory/kb/notecards/pathway_cards.preview.jsonl', 'utf-8');
             pathwayHits = data.trim().split('\\\\n').map(l => JSON.parse(l))
               .filter(c => c.summary && c.summary.toLowerCase().includes(query.toLowerCase()))
               .map(c => ({ chunk_id: c.pathway_id, content: c.summary, tags: c.shared_tags || [], type: c.type }));
          } catch (err) {}
        }
        
        const merged = [...summaryHits.rows, ...pathwayHits].sort((a,b) => 0.5 - Math.random()).slice(0, limit);
        
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
    
    const narrative = \\\`This context pack contains \\\${cards.length} cards: \\\` + 
      Object.entries(types).map(([t, n]) => \\\`\\\${n} \\\${t}s\\\`).join(', ') + '.';
      
    return { content: [{ type: 'text' as const, text: JSON.stringify({ narrative, stats: types }, null, 2) }] };
  }
);
`;

if (searchCardsBlockEnd > 1) {
    content = content.slice(0, searchCardsBlockEnd) + kbTools + content.slice(searchCardsBlockEnd);
    fs.writeFileSync(filePath, content);
    console.log('Added kb.search_notecards and kb.explain_context_pack');
} else {
    console.error('Could not find kb.search_cards block');
}
