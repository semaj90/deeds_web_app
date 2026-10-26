// Read-only dry run for empty Qdrant collections (0 points).
// Lists snapshots and repo references per collection. Has no delete path.
// Writes a receipt under .tmp/atlas/. Makes no Qdrant or filesystem changes outside .tmp.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, '.tmp', 'atlas', 'qdrant-empty-collections-dry-run-v1.json');
const QDRANT = 'http://127.0.0.1:6333';
const SEARCH_ROOTS = ['sveltekit-frontend/src', 'sveltekit-frontend/scripts', 'scripts', 'python'];

async function qdrant(path) {
  const r = await fetch(`${QDRANT}${path}`, { signal: AbortSignal.timeout(10000) });
  return r.json();
}

function countRefs(name) {
  const res = spawnSync(
    'rg',
    ['-l', '--fixed-strings', '--hidden', '-g', '!node_modules', '-g', '!*.md', '-g', '!*.jsonl', name, ...SEARCH_ROOTS],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (res.status === 1) return [];
  if (res.status !== 0) throw new Error(`rg failed for ${name}: ${res.stderr}`);
  return res.stdout.split('\n').filter(Boolean);
}

const list = (await qdrant('/collections')).result.collections.map((c) => c.name);
const candidates = [];
for (const name of list) {
  const info = (await qdrant(`/collections/${name}`)).result;
  const points = info?.points_count ?? null;
  if (points !== 0) continue;
  const snaps = (await qdrant(`/collections/${name}/snapshots`)).result ?? [];
  const refs = countRefs(name);
  candidates.push({
    name,
    points,
    snapshots: snaps.map((s) => ({ name: s.name, sizeBytes: s.size, checksum: s.checksum })),
    referencingFiles: refs.length,
    referenceSample: refs.slice(0, 5),
    recommendation: refs.length === 0 && snaps.length <= 1 ? 'REVIEW_LIKELY_UNUSED' : 'KEEP_UNTIL_OWNER_REVIEW',
  });
}

const receipt = {
  schema: 'atlas.qdrant.empty-collections.dry-run.v1',
  generatedAt: new Date().toISOString(),
  writesPerformed: false,
  totalCollections: list.length,
  emptyCollections: candidates.length,
  candidates,
};
mkdirSync(join(ROOT, '.tmp', 'atlas'), { recursive: true });
writeFileSync(OUT, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receipt: OUT, totalCollections: receipt.totalCollections, emptyCollections: receipt.emptyCollections }, null, 2));
for (const c of candidates) console.log(`${c.recommendation.padEnd(24)} refs=${String(c.referencingFiles).padStart(3)} snaps=${c.snapshots.length} ${c.name}`);
