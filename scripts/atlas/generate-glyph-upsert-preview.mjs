#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
const acePacketPath = path.join(process.cwd(), '.opencode/ace-packet.json');
if (!fs.existsSync(acePacketPath)) { console.error('ACE packet missing'); process.exit(1); }
const packet = JSON.parse(fs.readFileSync(acePacketPath,'utf8'));
const cards = packet.cards || packet.entries || [];
function inferSection(card){
	const text = (card.compressed||card.title||'').toLowerCase();
	if(text.includes('party')||text.includes('plaintiff')||text.includes('defendant')) return 'PARTIES';
	if(text.includes('court')) return 'JURISDICTION';
	if(text.includes('fact')||text.includes('evidence')) return 'FACTS';
	if(text.includes('law')||text.includes('statute')) return 'LEGAL_AUTHORITY';
	return 'UNKNOWN';
}
function build(card){
	const section = inferSection(card);
	const summary = (card?.semantic?.summary) || card?.summary || card?.title || (card?.text?String(card.text).slice(0,240):'') || (card?.content?String(card.content).slice(0,240):'') || '';
	return {
		glyphId: card.id || card.title || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
		sourceId: card.source||card.path||card.id||null,
		kind: card.kind||'chunk',
		semantic: { title: card.title, summary, section, tags: Array.isArray(card.tags)?card.tags:[], entities: Array.isArray(card.entities)?card.entities:[] },
		vector: { centroidId: null },
		topology: { somCluster: null },
		summary
	};
}
const outDir = path.join(process.cwd(),'scripts','atlas','out'); fs.mkdirSync(outDir,{recursive:true});
const fname = path.join(outDir, `glyph-upserts-fixed-${new Date().toISOString().slice(0,10)}.sql`);
const lines = cards.map(card=>{
	const gr = build(card);
	const payload = JSON.stringify(gr).replace(/'/g, "''");
	const summaryExpr = `COALESCE(\n  NULLIF(payload.j->'semantic'->>'summary',''),\n  NULLIF(payload.j->>'summary',''),\n  NULLIF(payload.j->>'title',''),\n  LEFT(COALESCE(payload.j->>'text', payload.j->>'content', ''),240),\n  ''\n)`;
	// Use UPDATE-first then INSERT-if-not-exists to avoid relying on unique constraint
	return `-- upsert for ${gr.glyphId}\nWITH payload AS (SELECT '${payload}'::jsonb AS j),\nupsert AS (\n  UPDATE glyph_records SET\n    source_id = ${gr.sourceId ? `'${String(gr.sourceId).replace(/'/g, "''")}'` : 'NULL'},\n    kind = '${gr.kind}',\n    section = '${gr.semantic.section}',\n    summary = ${summaryExpr},\n    tags = COALESCE(payload.j->'semantic'->'tags','[]'::jsonb),\n    entities = COALESCE(payload.j->'semantic'->'entities','[]'::jsonb),\n    record_json = payload.j,\n    centroid_id = ${gr.vector.centroidId === null ? 'NULL' : gr.vector.centroidId},\n    som_cluster = ${gr.topology.somCluster === null ? 'NULL' : gr.topology.somCluster},\n    updated_at = NOW()\n  FROM payload\n  WHERE glyph_records.glyph_id = '${gr.glyphId.replace(/'/g, "''")}'\n  RETURNING glyph_records.*\n)\nINSERT INTO glyph_records (glyph_id, source_id, kind, section, summary, tags, entities, record_json, centroid_id, som_cluster, created_at)\nSELECT '${gr.glyphId.replace(/'/g, "''")}', ${gr.sourceId ? `'${String(gr.sourceId).replace(/'/g, "''")}'` : 'NULL'}, '${gr.kind}', '${gr.semantic.section}', ${summaryExpr}, COALESCE(payload.j->'semantic'->'tags','[]'::jsonb), COALESCE(payload.j->'semantic'->'entities','[]'::jsonb), payload.j, ${gr.vector.centroidId === null ? 'NULL' : gr.vector.centroidId}, ${gr.topology.somCluster === null ? 'NULL' : gr.topology.somCluster}, now()\nFROM payload\nWHERE NOT EXISTS (SELECT 1 FROM upsert);\n`;
});
fs.writeFileSync(fname, lines.join('\n'), 'utf8');
console.log('Wrote fixed SQL preview to', fname);
