#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import duckdb from 'duckdb';

const ROOT = process.cwd();
const OUT = path.join(ROOT,'.tmp');
const dbPath = path.join(OUT,'duckdb_feature_gap.db');

function exists(p){ return fs.existsSync(p); }

async function run(){
  if(!fs.existsSync(OUT)) fs.mkdirSync(OUT,{recursive:true});
  const conn = new duckdb.Database(dbPath);
  const con = conn.connect();

  // helper to run SQL and return rows
  const runQuery = (sql)=>new Promise((res,rej)=>{
    con.all(sql,(err,rows)=>{ if(err) return rej(err); res(rows); });
  });

  // Load JSONL inputs if present
  const inputs = {
    fileNodes: path.join(OUT,'ast-file-nodes.jsonl'),
    resolvedEdges: path.join(OUT,'ast-import-edges-resolved.jsonl'),
    unresolved: path.join(OUT,'ast-unresolved-imports.jsonl'),
    topo: path.join(OUT,'ast-topology-summary.json'),
    recommendations: path.join(ROOT,'.opencode','recommendations','recommendations.json'),
    clusterCards: path.join(ROOT,'memory','exports','cluster-cards.jsonl'),
    pathwayCards: path.join(ROOT,'memory','exports','pathway-cards.jsonl')
  };

  // Create temp tables by reading JSON files via read_json_auto if available
  try{
    if(exists(inputs.fileNodes)) await runQuery(`CREATE OR REPLACE TABLE file_nodes AS SELECT * FROM read_json_auto('${inputs.fileNodes.replace(/\\/g,'\\\\')}');`);
    if(exists(inputs.resolvedEdges)) await runQuery(`CREATE OR REPLACE TABLE resolved_edges AS SELECT * FROM read_json_auto('${inputs.resolvedEdges.replace(/\\/g,'\\\\')}');`);
    if(exists(inputs.unresolved)) await runQuery(`CREATE OR REPLACE TABLE unresolved_imports AS SELECT * FROM read_json_auto('${inputs.unresolved.replace(/\\/g,'\\\\')}');`);
    if(exists(inputs.topo)) await runQuery(`CREATE OR REPLACE TABLE topology_summary AS SELECT * FROM read_json_auto('${inputs.topo.replace(/\\/g,'\\\\')}');`);
  }catch(e){ console.error('DuckDB load failed:', e.message); process.exit(2); }

  const report = {};
  // Top unresolved imports
  try{
    const rows = await runQuery(`SELECT spec, count(*) AS cnt FROM unresolved_imports GROUP BY spec ORDER BY cnt DESC LIMIT 50;`);
    report.topUnresolved = rows;
  }catch(e){ report.topUnresolved = []; }

  // Directories with most missing edges (by unresolved.from)
  try{
    const rows = await runQuery(`SELECT regexp_replace(split_part(from, '/',1), '^$', '.') AS dirroot, count(*) AS cnt FROM unresolved_imports GROUP BY dirroot ORDER BY cnt DESC LIMIT 50;`);
    report.topDirsMissing = rows;
  }catch(e){ report.topDirsMissing = []; }

  // Orphan files: file_nodes not present in edges (from or to)
  try{
    const rows = await runQuery(`SELECT f.path FROM file_nodes f LEFT JOIN (
      SELECT from AS p FROM resolved_edges
      UNION ALL
      SELECT _neo4jTarget AS p FROM resolved_edges WHERE _neo4jTarget IS NOT NULL
      UNION ALL
      SELECT to AS p FROM resolved_edges
    ) e ON f.path = e.p WHERE e.p IS NULL LIMIT 200;`);
    report.orphanFiles = rows.map(r=>r.path);
  }catch(e){ report.orphanFiles = []; }

  // Features with no tests (directories under src/lib with no *.(spec|test).ts files)
  try{
    const rows = await runQuery(`SELECT dirname, cnt_files, cnt_tests FROM (
      SELECT regexp_replace(split_part(path, '/',3), '^$', '.') AS dirname,
             count(*) FILTER (WHERE path LIKE '%src/lib/%') AS cnt_files,
             sum(CASE WHEN path LIKE '%test.%' OR path LIKE '%.spec.%' OR path LIKE '%.test.%' THEN 1 ELSE 0 END) AS cnt_tests
      FROM file_nodes GROUP BY dirname
    ) WHERE cnt_tests = 0 ORDER BY cnt_files DESC LIMIT 50;`);
    report.featuresNoTests = rows;
  }catch(e){ report.featuresNoTests = []; }

  // Files with high imports but no feature label (assuming file_nodes has 'feature' field)
  try{
    const rows = await runQuery(`SELECT f.path, coalesce(e.in_count,0) AS imports_in FROM file_nodes f LEFT JOIN (
      SELECT to AS p, count(*) AS in_count FROM resolved_edges GROUP BY to
    ) e ON f.path = e.p WHERE (f.feature IS NULL OR f.feature = '') ORDER BY imports_in DESC LIMIT 50;`);
    report.highImportsNoFeature = rows;
  }catch(e){ report.highImportsNoFeature = []; }

  // Graph edge density (avg degree)
  try{
    const rows = await runQuery(`SELECT count(*) AS edges, (SELECT count(*) FROM file_nodes) AS nodes, CAST(count(*) AS DOUBLE)/NULLIF((SELECT count(*) FROM file_nodes),0) AS avg_degree FROM resolved_edges;`);
    report.edgeDensity = rows[0]||{};
  }catch(e){ report.edgeDensity = {}; }

  // write JSON and markdown
  const outJson = path.join(OUT,'duckdb-feature-gap-report.json');
  fs.writeFileSync(outJson, JSON.stringify(report,null,2));

  let md = '# DuckDB Feature Gap Report\n\n';
  md += '## Top Unresolved Imports\n\n';
  for (const r of report.topUnresolved.slice(0,50)) md += `- ${r.spec}: ${r.cnt}\n`;
  md += '\n## Directories with most missing edges\n\n';
  for (const r of report.topDirsMissing.slice(0,50)) md += `- ${r.dirroot}: ${r.cnt}\n`;
  md += '\n## Orphan Files (samples)\n\n';
  for (const p of (report.orphanFiles||[]).slice(0,200)) md += `- ${p}\n`;
  md += '\n## Features with no tests\n\n';
  for (const r of report.featuresNoTests) md += `- ${r.dirname}: files=${r.cnt_files}\n`;
  md += '\n## Files with many incoming imports but no feature label\n\n';
  for (const r of report.highImportsNoFeature) md += `- ${r.path}: imports_in=${r.imports_in}\n`;

  const outMd = path.join(OUT,'duckdb-feature-gap-report.md');
  fs.writeFileSync(outMd, md);

  console.log('Wrote', outJson, outMd);
  con.close();
}

run().catch(e=>{ console.error(e); process.exit(1); });
