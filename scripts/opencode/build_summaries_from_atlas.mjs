#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const runDefault = 'sveltekit-frontend/memory/runs/2026-05-27T19-37-18';
const outDir = '.opencode/cards';
const summariesFile = path.join(outDir, 'summaries.jsonl');

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

function readJSONLines(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    return txt.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
  } catch (e) { return null; }
}

async function main() {
  const runDir = process.argv[2] || runDefault;
  console.log('Using run dir:', runDir);
  if (!fs.existsSync(runDir)) {
    console.error('Run directory not found:', runDir);
    process.exitCode = 2;
    return;
  }

  // candidate files
  const ingestPath = path.join(runDir, 'ingest.jsonl');
  const mappingPath = path.join(runDir, 'llm_synthesis_mapping.json');
  const graphNodesPath = path.join(runDir, 'graph_nodes.json');
  const graphEdgesPath = path.join(runDir, 'graph_edges.json');
  const docsAtlasPath = path.join(runDir, 'documents-atlas.latest.md');
  const codebaseAtlasPath = path.join(runDir, 'codebase-atlas.top.json');

  const mapping = readJSON(mappingPath);
  const graphNodes = readJSON(graphNodesPath);
  const ingest = fs.existsSync(ingestPath) ? readJSONLines(ingestPath) : null;

  if (!mapping && !graphNodes && !ingest) {
    console.error('No usable atlas artifacts found in', runDir);
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const out = fs.createWriteStream(summariesFile, { flags: 'w' });
  const seen = new Set();

  // Prefer llm_synthesis_mapping entries
  if (mapping && Array.isArray(mapping)) {
    for (const item of mapping) {
      // expected shape: { id, sourceRef, summary, keywords, tags, file, mtime }
      const cardId = item.card_id || item.id || (`atlas_existing_${item.sourceRef || Math.random().toString(36).slice(2,9)}`);
      if (seen.has(cardId)) continue;
      const row = {
        card_id: cardId,
        sourceRef: item.sourceRef || item.source_ref || item.source || null,
        summary: item.summary || item.text || item.synthesis || '',
        keywords: item.keywords || item.kv || [],
        tags: (item.tags || []).concat(['source:atlas','type:graphify','project:atlas']),
        file: item.file || null,
        mtime: item.mtime || (item.updated_at ? Date.parse(item.updated_at) : 0)
      };
      out.write(JSON.stringify(row) + '\n');
      seen.add(cardId);
    }
  }

  // Fallback: use graph nodes (if they contain text or summary)
  if (graphNodes && Array.isArray(graphNodes)) {
    for (const node of graphNodes) {
      const cardId = node.id || `atlas_node_${node._id||Math.random().toString(36).slice(2,9)}`;
      if (seen.has(cardId)) continue;
      const summary = node.summary || node.excerpt || node.text || node.description || '';
      const keywords = node.keywords || node.tags || [];
      const sourceRef = node.sourceRef || node.source_ref || node.source || node.file_path || null;
      const row = {
        card_id: cardId,
        sourceRef,
        summary,
        keywords,
        tags: (node.tags || []).concat(['source:atlas','type:graphify','project:atlas']),
        file: node.file || node.file_path || null,
        mtime: node.mtime || 0
      };
      out.write(JSON.stringify(row) + '\n');
      seen.add(cardId);
    }
  }

  // Ingest entries may map original docs; include them as low-priority if no summary exists
  if (ingest && Array.isArray(ingest)) {
    for (const doc of ingest) {
      const cardId = `ingest_${doc.id || doc.source || Math.random().toString(36).slice(2,9)}`;
      if (seen.has(cardId)) continue;
      const row = {
        card_id: cardId,
        sourceRef: doc.source || doc.sourceRef || null,
        summary: doc.summary || doc.excerpt || doc.text_snippet || '',
        keywords: doc.keywords || [],
        tags: (doc.tags || []).concat(['source:atlas','type:ingest','project:atlas']),
        file: doc.file || null,
        mtime: doc.mtime || 0
      };
      out.write(JSON.stringify(row) + '\n');
      seen.add(cardId);
    }
  }

  out.end();
  console.log('Wrote summaries to', summariesFile, 'rows=', seen.size);
}

// Always run main when executed with Node (fix Windows file:// path mismatch)
main().catch(err => {
  console.error('Error running build_summaries_from_atlas:', err);
  process.exit(1);
});
