import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('scripts/graph-data-500.json', 'utf-8'));
const nodes = data.nodes || [];
const edges = data.edges || [];

// Build edge lookup
const connected = new Set();
for (const e of edges) {
  connected.add(e.source);
  connected.add(e.target);
}

// Group by directory
const dirs = {};
for (const n of nodes) {
  const parts = n.id.split('/');
  const dir = parts.slice(0, -1).join('/');
  if (!dirs[dir]) dirs[dir] = { total: 0, orphans: 0, lines: 0, orphanFiles: [], connectedFiles: [] };
  dirs[dir].total++;
  dirs[dir].lines += (n.lines || 0);
  if (!connected.has(n.id)) {
    dirs[dir].orphans++;
    dirs[dir].orphanFiles.push({ id: n.id, lines: n.lines || 0, complexity: n.complexity || 0 });
  } else {
    dirs[dir].connectedFiles.push({ id: n.id, lines: n.lines || 0, complexity: n.complexity || 0 });
  }
}

// Sort by orphan ratio, min 3 files
const targets = Object.entries(dirs)
  .filter(([, v]) => v.total >= 3)
  .map(([dir, v]) => ({ dir, total: v.total, orphans: v.orphans, pct: Math.round(v.orphans / v.total * 100), lines: v.lines, orphanFiles: v.orphanFiles, connectedFiles: v.connectedFiles }))
  .sort((a, b) => b.pct - a.pct || b.orphans - a.orphans);

console.log('=== CONSOLIDATION TARGETS (>50% orphan, 3+ files) ===\n');
for (const t of targets.filter(t => t.pct >= 50)) {
  console.log(`${t.dir} — ${t.orphans}/${t.total} orphans (${t.pct}%) — ${t.lines} LOC`);
  for (const f of t.orphanFiles.slice(0, 5)) {
    console.log(`  [ORPHAN] ${f.id} (${f.lines} lines, complexity ${f.complexity})`);
  }
  if (t.orphanFiles.length > 5) console.log(`  ... +${t.orphanFiles.length - 5} more orphans`);
  for (const f of t.connectedFiles.slice(0, 3)) {
    console.log(`  [WIRED]  ${f.id} (${f.lines} lines)`);
  }
  console.log();
}

console.log('\n=== TOP 25 DIRS BY ORPHAN % ===\n');
for (const t of targets.slice(0, 25)) {
  console.log(`${t.pct}%  ${t.dir} — ${t.orphans}/${t.total} orphans — ${t.lines} LOC`);
}

// Summary stats
const highOrphan = targets.filter(t => t.pct >= 50);
const totalOrphanLOC = highOrphan.reduce((s, t) => s + t.orphanFiles.reduce((ss, f) => ss + f.lines, 0), 0);
console.log(`\n=== SUMMARY ===`);
console.log(`Dirs with >50% orphans: ${highOrphan.length}`);
console.log(`Total orphan LOC in those dirs: ${totalOrphanLOC}`);
console.log(`Total connected files across all dirs: ${targets.reduce((s, t) => s + t.connectedFiles.length, 0)}`);
