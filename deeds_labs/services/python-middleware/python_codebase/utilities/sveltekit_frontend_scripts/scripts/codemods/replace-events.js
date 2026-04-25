#!/usr/bin/env node
// ESM codemod: replace Svelte deprecated event directives (on:click -> onclick)
// Dry-run by default. Use --apply to write files.

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
  ['on:mouseleave', 'on:mouseleave'],
];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (e.isFile() && full.endsWith('.svelte')) {
      files.push(full);
    }
  }
  return files;
}

async function run() {
  const apply = process.argv.includes('--apply');
  const root = path.join(process.cwd(), 'sveltekit-frontend', 'src');
  try {
    await fs.access(root);
  } catch (err) {
    console.error('Could not find', root);
    process.exit(1);
  }

  const files = await walk(root);
  const changed = [];

  for (const file of files) {
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
      changed.push(file);
      if (apply) await fs.writeFile(file, out, 'utf8');
    }
  }

  console.log(`${changed.length} files would be modified.`);
  if (changed.length > 0) console.log(changed.join('\n'));
  if (!apply) console.log('\nRun with --apply to write changes.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
