#!/usr/bin/env node
import { promises as fsp } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

async function pathExists(p) { try { await fsp.access(p); return true } catch { return false } }
async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); }
async function isDir(p) { const st = await fsp.lstat(p); return st.isDirectory(); }
async function copyRecursive(src, dst) {
  const st = await fsp.lstat(src);
  if (st.isDirectory()) {
    await ensureDir(dst);
    const entries = await fsp.readdir(src);
    for (const e of entries) {
      await copyRecursive(path.join(src, e), path.join(dst, e));
    }
  } else {
    await ensureDir(path.dirname(dst));
    await fsp.copyFile(src, dst);
  }
}
async function linkOrCopy(src, dst, mode) {
  if (!(await pathExists(src))) {
    console.log(`⚠️  missing: ${src}`);
    return;
  }
  if (await pathExists(dst)) {
    console.log(`↩️  exists, skip: ${dst}`);
    return;
  }
  await ensureDir(path.dirname(dst));
  if (mode === 'symlink') {
    try {
      const type = (await isDir(src)) ? 'junction' : 'file';
      await fsp.symlink(src, dst, type);
      console.log(`🔗 symlinked ${src} -> ${dst}`);
      return;
    } catch (e) {
      console.log(`⚠️  symlink failed (${e.code}), copying: ${src} -> ${dst}`);
    }
  }
  await copyRecursive(src, dst);
  console.log(`📄 copied ${src} -> ${dst}`);
}

async function main() {
  const mapPath = path.join(repoRoot, 'scripts', 'organized-files-map.json');
  if (!(await pathExists(mapPath))) {
    console.log('ℹ️  no organized-files map');
    return;
  }
  const raw = await fsp.readFile(mapPath, 'utf8');
  let items = [];
  try { items = JSON.parse(raw) } catch (e) { console.error('Invalid JSON:', e.message); process.exit(1); }
  if (!Array.isArray(items) || items.length === 0) {
    console.log('ℹ️  organized-files map empty');
    return;
  }
  console.log(`🧩 syncing ${items.length} item(s)`);
  for (const it of items) {
    const { from, to, mode = 'symlink' } = it || {};
    if (!from || !to) continue;
    const absFrom = path.resolve(repoRoot, from);
    const absTo = path.resolve(repoRoot, to);
    await linkOrCopy(absFrom, absTo, mode);
  }
}

main().catch(e => { console.error('Sync error:', e); process.exit(1); });

async function main() {
  console.log('🚀 Starting organized files sync...');
  console.log(`📂 Project root: ${projectRoot}`);

  const mappings = await loadMapping();
  console.log(`📋 Found ${mappings.length} mappings to process`);

  let successCount = 0;
  let totalCount = mappings.length;

  for (const mapping of mappings) {
    const success = await syncMapping(mapping);
    if (success) successCount++;
  }

  console.log('');
  console.log(`📊 Sync Results:`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${totalCount - successCount}`);
  console.log(`   📈 Success Rate: ${((successCount / totalCount) * 100).toFixed(1)}%`);

  if (successCount === totalCount) {
    console.log('🎉 All files synced successfully!');
    process.exit(0);
  } else {
    console.log('⚠️  Some files failed to sync. Check the logs above.');
    process.exit(1);
  }
}

// Handle CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}

export { syncMapping, loadMapping };