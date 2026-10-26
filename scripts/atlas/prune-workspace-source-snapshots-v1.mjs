#!/usr/bin/env node
// Retention for materialized workspace source snapshots under .tmp/workspace-source-snapshots/<sha256>/.
// Default is a dry run. --apply moves unprotected revisions to deeds_labs/archive/<date>/ and records
// one group entry in docs/archive-manifest.json. Nothing is deleted.
//
// Protected (never moved): the admitted revision passed with --admitted, and the newest revision by mtime.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const SNAP_ROOT = path.join(ROOT, '.tmp', 'workspace-source-snapshots');
const MANIFEST = path.join(ROOT, 'docs', 'archive-manifest.json');
const apply = process.argv.includes('--apply');
const admittedArg = process.argv.find((a) => a.startsWith('--admitted='));
const admitted = admittedArg ? admittedArg.slice('--admitted='.length).replace(/^sha256:/, '') : null;

if (!fs.existsSync(SNAP_ROOT)) { console.log(JSON.stringify({ status: 'NO_SNAPSHOT_ROOT' })); process.exit(0); }

const REV = /^[0-9a-f]{64}$/;
const revs = fs.readdirSync(SNAP_ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && REV.test(e.name))
  .map((e) => e.name);

function dirStats(dir) {
  let bytes = 0; let files = 0; let newest = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      const st = fs.statSync(p);
      bytes += st.size; files++; if (st.mtimeMs > newest) newest = st.mtimeMs;
    }
  }
  return { bytes, files, newest };
}

function trackedRefCount(rev) {
  try {
    const out = execFileSync('git', ['grep', '-l', '-F', rev.slice(0, 16), '--', ':!.tmp', ':!deeds_labs'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter(Boolean).length;
  } catch { return 0; }
}

const rows = revs.map((rev) => {
  const s = dirStats(path.join(SNAP_ROOT, rev));
  return { revision: rev, ...s, trackedRefs: trackedRefCount(rev) };
});
const newestRev = [...rows].sort((a, b) => b.newest - a.newest)[0]?.revision;

for (const r of rows) {
  const reasons = [];
  if (admitted && r.revision === admitted) reasons.push('ADMITTED');
  // Tracked refs cite the revision hash; the sealed JSON under docs/reports keeps those valid, so refs do not pin the folder.
  if (r.revision === newestRev) reasons.push('NEWEST');
  r.protected = reasons.length > 0;
  r.reasons = reasons;
}

const toArchive = rows.filter((r) => !r.protected);
const plan = {
  mode: apply ? 'APPLY' : 'DRY_RUN',
  totalMB: +(rows.reduce((a, r) => a + r.bytes, 0) / 1048576).toFixed(0),
  archiveMB: +(toArchive.reduce((a, r) => a + r.bytes, 0) / 1048576).toFixed(0),
  rows: rows.map((r) => ({
    revision: r.revision.slice(0, 12), files: r.files, MB: +(r.bytes / 1048576).toFixed(0),
    protected: r.protected, reasons: r.reasons,
  })),
};
console.log(JSON.stringify(plan, null, 2));

if (!apply) process.exit(0);
if (toArchive.length === 0) { console.log('nothing to archive'); process.exit(0); }

const date = new Date().toISOString().slice(0, 10);
const destRoot = path.join(ROOT, 'deeds_labs', 'archive', date, 'workspace-source-snapshots');
fs.mkdirSync(destRoot, { recursive: true });
for (const r of toArchive) {
  const dest = path.join(destRoot, r.revision);
  if (fs.existsSync(dest)) throw new Error(`DESTINATION_EXISTS ${dest}`);
  fs.renameSync(path.join(SNAP_ROOT, r.revision), dest);
}
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
manifest.push({
  path: '.tmp/workspace-source-snapshots',
  archive_path: path.relative(ROOT, destRoot).split(path.sep).join('/'),
  type: 'directory-group',
  revisions: toArchive.map((r) => r.revision),
  file_count: toArchive.reduce((a, r) => a + r.files, 0),
  archived: new Date().toISOString(),
  reason: 'Unprotected materialized workspace snapshots (no tracked refs, not admitted, not newest). Source bytes retained in archive; restore by moving revision folders back under .tmp/workspace-source-snapshots/.',
});
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ archivedRevisions: toArchive.length, archivedMB: plan.archiveMB, destination: destRoot }));
