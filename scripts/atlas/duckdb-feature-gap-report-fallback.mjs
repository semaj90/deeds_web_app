import fs from 'fs';
import path from 'path';
const ROOT = process.cwd();
const OUT = path.join(ROOT,'.tmp');
function readJsonl(p){ if(!fs.existsSync(p)) return []; return fs.readFileSync(p,'utf8').trim().split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)); }
const fileNodes = readJsonl(path.join(OUT,'ast-file-nodes.jsonl'));
const resolvedEdges = readJsonl(path.join(OUT,'ast-import-edges-resolved.jsonl'));
const unresolved = readJsonl(path.join(OUT,'ast-unresolved-imports.jsonl'));
const topo = fs.existsSync(path.join(OUT,'ast-topology-summary.json')) ? JSON.parse(fs.readFileSync(path.join(OUT,'ast-topology-summary.json'),'utf8')) : null;

// Helpers
const isArchive = (p)=> /backup|reports|phase\d+-backups|api-cleanup|deeds_labs|\.cache|\.tmp|archive|backup-/i.test(p);
const isActive = (p)=> p && (p.startsWith('sveltekit-frontend/src/') || p.startsWith('src/'));

// Top unresolved imports
const unresolvedBySpec = {};
for(const u of unresolved){ const s=u.spec||'(empty)'; unresolvedBySpec[s]=(unresolvedBySpec[s]||0)+1; }
const topUnresolved = Object.entries(unresolvedBySpec).map(([spec,cnt])=>({spec,cnt})).sort((a,b)=>b.cnt-a.cnt);

// unresolved by directory (use first 2 path segments)
const unresolvedByDir = {};
for(const u of unresolved){ const from=u.from||''; const segs = from.split('/'); const dir = segs.slice(0,3).join('/'); unresolvedByDir[dir]=(unresolvedByDir[dir]||0)+1; }
const topDirs = Object.entries(unresolvedByDir).map(([dir,cnt])=>({dir,cnt})).sort((a,b)=>b.cnt-a.cnt);

// archive/backup noise count
let archiveCount=0; let activeCount=0;
for(const u of unresolved){ if(isArchive(u.from||'')||isArchive(u.spec||'')) archiveCount++; if(isActive(u.from)) activeCount++; }

// orphan files: fileNodes paths not present in any resolved edge from/to/_neo4jTarget
const fileSet = new Set(fileNodes.map(f=>f.path));
const referenced = new Set();
for(const e of resolvedEdges){ if(e.from) referenced.add(e.from); if(e.to) referenced.add(String(e.to).replace(/#L\d+$/,'')); if(e.targetSourceRef) referenced.add(String(e.targetSourceRef).replace(/#L\d+$/,'')); if(e._neo4jTarget) referenced.add(String(e._neo4jTarget)); }
const orphanFiles = [...fileSet].filter(p=>!referenced.has(p));

// incoming import counts
const incoming = {};
for(const e of resolvedEdges){ const tgt = e._neo4jTarget || e.to || e.resolvedPath || e.targetSourceRef || null; if(!tgt) continue; const t = String(tgt).replace(/#L\d+$/,''); incoming[t]=(incoming[t]||0)+1; }

// files with high imports but no feature label (assume fileNodes may have .feature)
const fileInfo = {};
for(const f of fileNodes){ fileInfo[f.path]=f; }
const highImportsNoFeature = Object.entries(incoming).map(([path,cnt])=>({path,cnt,feature: (fileInfo[path] && fileInfo[path].feature) || null})).filter(x=>!x.feature).sort((a,b)=>b.cnt-a.cnt).slice(0,50);

// features with no tests: group by top-level dir under src/lib (e.g., src/lib/<feature>)
const featureMap = {}; for(const f of fileNodes){ if(!f.path) continue; if(!(f.path.startsWith('sveltekit-frontend/src/lib/')||f.path.startsWith('src/lib/'))) continue; const rel = f.path.replace(/^sveltekit-frontend\/src\/lib\//,'').replace(/^src\/lib\//,''); const top = rel.split('/')[0]; featureMap[top]=featureMap[top]||{files:0,tests:0}; featureMap[top].files++; if(/\.spec\.|\.test\.|/i.test(f.path)) featureMap[top].tests++; }
const featuresNoTests = Object.entries(featureMap).map(([k,v])=>({feature:k,files:v.files,tests:v.tests})).filter(x=>x.tests===0).sort((a,b)=>b.files-a.files).slice(0,50);

// sourceRef coverage %: percent of fileNodes with sourceRef and percent of resolvedEdges with sourceRef/targetSourceRef
const filesWithSourceRef = fileNodes.filter(f=>f.sourceRef).length; const totalFiles = fileNodes.length; const fileSourceRefPct = totalFiles?Math.round(filesWithSourceRef/totalFiles*10000)/100:0;
let edgesWithSourceRef=0; for(const e of resolvedEdges){ if(e.sourceRef && e.targetSourceRef) edgesWithSourceRef++; }
const edgeSourceRefPct = resolvedEdges.length?Math.round(edgesWithSourceRef/resolvedEdges.length*10000)/100:0;

// recommended max-10 human-reviewed fixes: pick unresolved specs with highest counts that have active importers
const recs = [];
for(const {spec,cnt} of topUnresolved){ const importers = unresolved.filter(u=>u.spec===spec).map(u=>u.from); const activeImporters = importers.filter(isActive); if(activeImporters.length>0 && !isArchive(spec)) recs.push({spec,cnt,activeImporters: [...new Set(activeImporters)].slice(0,10)}); if(recs.length>=10) break; }

const report = {
  topUnresolved: topUnresolved.slice(0,50),
  topDirs: topDirs.slice(0,50),
  archiveCount,
  activeUnresolved: activeCount,
  orphanFiles: orphanFiles.slice(0,200),
  highImportsNoFeature,
  featuresNoTests,
  fileSourceRefPct,
  edgeSourceRefPct,
  recommendedFixes: recs
};

if(!fs.existsSync(OUT)) fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(path.join(OUT,'duckdb-feature-gap-report.json'), JSON.stringify(report,null,2));
let md = '# DuckDB Feature Gap Report (fallback)\n\n';
md += `**Top unresolved imports (top 20)**\n\n`;
for(const r of report.topUnresolved.slice(0,20)) md += `- ${r.spec}: ${r.cnt}\n`;
md += `\n**Unresolved by directory (top 20)**\n\n`;
for(const r of report.topDirs.slice(0,20)) md += `- ${r.dir}: ${r.cnt}\n`;
md += `\n**Archive/backup noise count**: ${report.archiveCount}\n`;
md += `**Active-source unresolved count**: ${report.activeUnresolved}\n\n`;
md += `**Orphan files (sample 50)**\n\n`;
for(const p of report.orphanFiles.slice(0,50)) md += `- ${p}\n`;
md += `\n**Files with high imports but no feature label (sample)**\n\n`;
for(const r of report.highImportsNoFeature.slice(0,20)) md += `- ${r.path}: imports_in=${r.cnt}\n`;
md += `\n**Features with no tests (sample)**\n\n`;
for(const r of report.featuresNoTests.slice(0,20)) md += `- ${r.feature}: files=${r.files}\n`;
md += `\n**SourceRef coverage**\n\n- Files with sourceRef: ${report.fileSourceRefPct}%\n- Resolved edges with both sourceRef+targetSourceRef: ${report.edgeSourceRefPct}%\n`;
md += `\n**Recommended human-reviewed fixes (max 10)**\n\n`;
for(const r of report.recommendedFixes) md += `- ${r.spec}: ${r.cnt} occurrences; active importers sample: ${r.activeImporters.join(', ')}\n`;

fs.writeFileSync(path.join(OUT,'duckdb-feature-gap-report.md'), md);
console.log('Wrote fallback report to .tmp/duckdb-feature-gap-report.{json,md}');
