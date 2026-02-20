import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('./unreachable-classified.json', 'utf8'));
const entries = Object.values(data.files);

const byCategory = {};
for (const e of entries) { byCategory[e.category] = (byCategory[e.category] || 0) + 1; }
console.log('=== UNREACHABLE FILES BY CATEGORY ===');
for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}
console.log(`  TOTAL: ${entries.length}`);

function getDir(p, depth) {
  const parts = p.replaceAll('\\', '/').split('/');
  return parts.slice(0, Math.min(depth, parts.length - 1)).join('/');
}

const corrupted = entries.filter(e => e.category === 'CORRUPTED');
const corruptDirs = {};
corrupted.forEach(e => { const d = getDir(e.path, 3); corruptDirs[d] = (corruptDirs[d] || 0) + 1; });
console.log(`\nCorrupted by directory (${corrupted.length}):`);
Object.entries(corruptDirs).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([d, c]) => console.log(`  ${d}: ${c}`));

const stubs = entries.filter(e => e.category === 'STUB');
const stubDirs = {};
stubs.forEach(e => { const d = getDir(e.path, 4); stubDirs[d] = (stubDirs[d] || 0) + 1; });
console.log(`\nStubs by directory (${stubs.length}):`);
Object.entries(stubDirs).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([d, c]) => console.log(`  ${d}: ${c}`));

const clean = entries.filter(e => e.category === 'CLEAN');
const cleanDirs = {};
clean.forEach(e => { const d = getDir(e.path, 3); cleanDirs[d] = (cleanDirs[d] || 0) + 1; });
console.log(`\nClean unreachable by directory (${clean.length}):`);
Object.entries(cleanDirs).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([d, c]) => console.log(`  ${d}: ${c}`));

// Feature candidates: clean files with meaningful names
const features = clean.filter(e => {
  const p = e.path.replaceAll('\\', '/');
  return !p.includes('services/') && (p.includes('lib/') || p.includes('routes/'));
});
console.log(`\nFeature candidates (clean, non-services, in lib/routes): ${features.length}`);
features.slice(0, 20).forEach(e => console.log(`  ${e.path} (${e.lines} lines)`));
