#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Base event mappings (Svelte runes -> runes-style attributes)
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
  ['on:contextmenu', 'oncontextmenu'],
  ['on:wheel', 'onwheel'],
  ['on:mousemove', 'onmousemove'],
  ['on:mousedown', 'onmousedown'],
  ['on:mouseup', 'onmouseup'],
];

// Regex helpers will account for optional modifiers like |preventDefault and optional whitespace
function buildRegexFor(from) {
  // Escape colon for regex
  const esc = from.replace(':', '\\:');
  // Match forms like: on:click, on:click|preventDefault, on:click | preventDefault, followed by = or {
  const pattern = `${esc}(?:\\|[\\|][^=\{]*)?\\s*(?:=|\\{)`;
  return new RegExp(pattern, 'g');
}

function walk(dir, filelist = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fp = path.join(dir, file);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      walk(fp, filelist);
    } else if (fp.endsWith('.svelte')) {
      filelist.push(fp);
    }
  });
  return filelist;
}

const root = path.join(process.cwd(), 'sveltekit-frontend', 'src');
if (!fs.existsSync(root)) {
  console.error('Could not find sveltekit-frontend/src at', root);
  process.exit(1);
}

const files = walk(root);
const changed = [];
const apply = process.argv.includes('--apply');

files.forEach(file => {
  let src = fs.readFileSync(file, 'utf8');
  let out = src;
  replacements.forEach(([from, to]) => {
    const re = buildRegexFor(from);
    out = out.replace(re, (match) => {
      // Replace the leading 'on:foo' portion and keep trailing char (= or {)
      const trailing = match.endsWith('=') ? '=' : match.endsWith('{') ? '{' : match.slice(-1);
      return to + trailing;
    });
  });
  if (out !== src) {
    changed.push(file);
    if (apply) fs.writeFileSync(file, out, 'utf8');
  }
});

console.log(`${changed.length} files would be modified.`);
if (changed.length) console.log(changed.join('\n'));
if (!apply) console.log('\nRun with --apply to write changes.');
