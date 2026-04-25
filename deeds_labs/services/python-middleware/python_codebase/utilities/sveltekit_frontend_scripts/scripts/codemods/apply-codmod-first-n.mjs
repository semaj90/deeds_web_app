#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const replacements = [
  ['on:click', 'onclick'],
  ['on:change', 'onchange'],
  ['on:input', 'oninput'],
  ['on:submit', 'onsubmit'],
  ['on:keydown', 'onkeydown'],
  ['on:keyup', 'onkeyup'],
  ['on:focus', 'onfocus'],
  ['on:blur', 'onblur'],
  ['on:mouseover', 'onmouseover'],
  ['on:mouseout', 'onmouseout'],
  ['on:mouseenter', 'onmouseenter'],
  ['on:mouseleave', 'onmouseleave'],
];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...await walk(full));
    } else if (e.isFile() && full.endsWith('.svelte')) {
      files.push(full);
    }
  }
  return files;
}

function fileHasOnAttr(content) {
  return /\bon:[a-zA-Z-]+/.test(content);
}

async function applyToFile(file) {
  const src = await fs.readFile(file, 'utf8');
  let out = src;
  for (const [from, to] of replacements) {
    const esc = from.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const reAttr = new RegExp(`${esc}\\s*=`, 'g');
    out = out.replace(reAttr, `${to}=`);
    const reBlock = new RegExp(`${esc}\\s*\\{`, 'g');
    out = out.replace(reBlock, `${to}{`);
  }
  if (out !== src) {
    const bakPath = `${file}.bak.${Date.now()}`;
    await fs.copyFile(file, bakPath);
    await fs.writeFile(file, out, 'utf8');
    return { file, bak: bakPath };
  }
  return null;
}

async function main() {
  const nArgIndex = process.argv.findIndex(a => a === '--n');
  const n = nArgIndex !== -1 ? Number(process.argv[nArgIndex + 1]) : 20;
  const offArgIndex = process.argv.findIndex(a => a === '--offset');
  const offset = offArgIndex !== -1 ? Number(process.argv[offArgIndex + 1]) : 0;

  // Find sveltekit-frontend root by walking upward from cwd
  async function findSveltekitRoot() {
    let dir = process.cwd();
    for (let i = 0; i < 8; ++i) {
      const candidate = path.join(dir, 'sveltekit-frontend');
      try {
        await fs.access(path.join(candidate, 'src'));
        return candidate;
      } catch (e) {
        // not found, go up
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    // final fallback: if we are inside sveltekit-frontend already
    try {
      await fs.access(path.join(process.cwd(), 'src'));
      return process.cwd();
    } catch (e) {}
    return null;
  }

  const skRoot = await findSveltekitRoot();
  if (!skRoot) {
    console.error('Could not locate sveltekit-frontend/src from cwd:', process.cwd());
    process.exit(1);
  }
  const root = path.join(skRoot, 'src');

  const allFiles = await walk(root);
  const candidates = [];
  for (const f of allFiles) {
    const content = await fs.readFile(f, 'utf8');
    if (fileHasOnAttr(content)) candidates.push(f);
  }

  if (candidates.length === 0) {
    console.log('No candidate files found.');
    return;
  }

  const toApply = candidates.slice(offset, offset + n);
  console.log(`Applying codemod to ${toApply.length} files (first ${n}).`);
  const applied = [];
  for (const f of toApply) {
    try {
      const res = await applyToFile(f);
      if (res) applied.push(res.file);
      else console.log(`No changes necessary for ${f}`);
    } catch (err) {
      console.error(`Failed to process ${f}:`, err);
    }
  }

  const outPath = path.join(skRoot, 'scripts', 'codemods', 'last-applied.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ applied, timestamp: Date.now() }, null, 2), 'utf8');
  console.log('\nApplied files:');
  applied.forEach(p => console.log(p));
  console.log(`\nWrote last-applied list to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
