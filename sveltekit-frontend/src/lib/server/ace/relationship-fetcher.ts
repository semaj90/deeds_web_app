import { pool } from '$lib/server/db/client.js';

export async function fetchCommunityRelationships(): Promise<string> {
  try {
    const { rows } = await pool.query(`
      SELECT src_community, dst_community, summary, purpose, weight
      FROM codebase_relationship_reports
      ORDER BY weight DESC
      LIMIT 10
    `);
    
    if (rows.length === 0) return '';
    
    const lines = rows.map(r => 
      `**Community ${r.src_community} → Community ${r.dst_community}** (${r.purpose}, weight=${r.weight})\n  ${r.summary}`
    );
    
    return `\n## Inter-Community Relationships (GraphRAG Connections)\n` + lines.join('\n\n');
  } catch (err) {
    console.warn('[ACE context] relationship fetch failed:', (err as Error)?.message);
    return '';
  }
}
