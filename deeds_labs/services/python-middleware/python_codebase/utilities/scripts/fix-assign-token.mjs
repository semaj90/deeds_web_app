#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const root = process.argv[2] || './sveltekit-frontend/src/lib';
const exts = new Set(['.ts', '.js', '.svelte']);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(full);
    } else if (ent.isFile() && exts.has(path.extname(ent.name))) {
      await fixFile(full);
    }
  }
}

async function fixFile(file) {
  try {
    let txt = await fs.readFile(file, 'utf8');
    let orig = txt;
    // Conservative fixes
    txt = txt.split('assign({,').join('assign({');
    txt = txt.split('actions: [;').join('actions: [');
    txt = txt.split('[;').join('[');
    // write only if changed
    if (txt !== orig) {
      await fs.writeFile(file, txt, 'utf8');
      console.log('patched', file);
    }
  } catch (err) {
    console.error('error', file, err.message);
  }
}

(async () => {
  const targetRoot = path.resolve(root);
  try {
    await walk(targetRoot);
    console.log('✅ Fixer completed for', targetRoot);
  } catch (err) {
    console.error('walk error', targetRoot, err.message);
  }
})();
