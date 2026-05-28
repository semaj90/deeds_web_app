#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'scripts', 'ingest', 'compress-cards.mjs');
const names = ['fmt', 'extractSummary', 'compressCard'];

function removeDuplicateFunctions(source, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const matches = [...source.matchAll(re)];
  if (matches.length <= 1) return { source, removed: 0 };

  let out = source;
  let removed = 0;

  // iterate from last to second (keep the first)
  for (let i = matches.length - 1; i >= 1; i--) {
    const start = matches[i].index;
    // find the opening brace after the function declaration
    const braceIdx = out.indexOf('{', start);
    if (braceIdx === -1) continue;
    let depth = 0;
    let end = braceIdx + 1;
    let inSingle = false, inDouble = false, inTemplate = false, inRegex = false;
    let prev = '';
    for (; end < out.length; end++) {
      const ch = out[end];
      if (ch === '\\'' && !inDouble && !inTemplate && prev !== '\\') inSingle = !inSingle;
      else if (ch === '"' && !inSingle && !inTemplate && prev !== '\\') inDouble = !inDouble;
      else if (ch === '`' && !inSingle && !inDouble && prev !== '\\') inTemplate = !inTemplate;
      // naive regex guard: skip when inside strings
      if (inSingle || inDouble || inTemplate) { prev = ch; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        if (depth === 0) { end++; break; }
        depth--;
      }
      prev = ch;
    }

    // remove slice from start to end
    out = out.slice(0, start) + '\n/* removed duplicate ' + name + ' */\n' + out.slice(end);
    removed++;
  }

  return { source: out, removed };
}

try {
  const src = fs.readFileSync(file, 'utf8');
  let next = src;
  let totalRemoved = 0;
  for (const name of names) {
    const res = removeDuplicateFunctions(next, name);
    next = res.source;
    totalRemoved += res.removed;
    if (res.removed > 0) console.log(`removed ${res.removed} duplicates of ${name}`);
  }

  if (totalRemoved > 0) {
    fs.writeFileSync(file, next, 'utf8');
    console.log(`wrote repaired file ${file} (removed ${totalRemoved} duplicate functions)`);
  } else {
    console.log('no duplicate helper functions found; no changes written');
  }
} catch (err) {
  console.error('repair script failed:', err);
  process.exit(2);
}
import fs from 'fs';
import path from 'path';

const file = 'scripts/ingest/compress-cards.mjs';
const src = fs.readFileSync(file, 'utf8');

const names = ['fmt', 'extractSummary', 'compressCard'];

function removeDuplicateFunctions(source, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const matches = [...source.matchAll(re)];
  if (matches.length <= 1) return source;

  let out = source;
  for (let i = matches.length - 1; i >= 1; i--) {
    const start = matches[i].index;
    let depth = 0;
    let end = start;
    let seenBrace = false;

    // This loop structure is a heuristic and may fail on complex code.
    // We are aiming to delete the subsequent duplicate function definition block.
    for (; end < out.length; end++) {
      const ch = out[end];
      if (ch === '{') {
        depth++;
        seenBrace = true;
      } else if (ch === '}') {
        depth--;
        if (seenBrace && depth === 0) {
          end++;
          break;
        }
      }
    }

    out = out.slice(0, start) + '\n' + out.slice(end);
  }

  return out;
}

let next = src;
for (const name of names) {
  next = removeDuplicateFunctions(next, name);
}

fs.writeFileSync(file, next);
console.log('repaired duplicate helpers in', file);