#!/usr/bin/env node
/**
 * Fix Svelte script tag corruption: <script, lang="ts"> -> <script lang="ts">
 * Also fix common attribute stray commas in class/style attributes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '../sveltekit-frontend');

let fixed = 0;
let scanned = 0;

function walkDir(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (!file.startsWith('.')) {
          walkDir(fullPath);
        }
      } else if (file.endsWith('.svelte')) {
        scanned++;
        let content = fs.readFileSync(fullPath, 'utf8');
        let original = content;

        // Fix: import, 'path' -> import 'path'
        content = content.replace(/\bimport\s*,\s*/g, 'import ');

        // Fix: export, { -> export {
        content = content.replace(/\bexport\s*,\s*/g, 'export ');

        // Fix: const, x -> const x
        content = content.replace(/\b(const|let|var)\s*,\s*/g, '$1 ');

        // Fix: type, Foo -> type Foo
        content = content.replace(/\btype\s*,\s*/g, 'type ');

        // Fix: interface, Foo -> interface Foo
        content = content.replace(/\binterface\s*,\s*/g, 'interface ');

        // Fix: function, name -> function name
        content = content.replace(/\bfunction\s*,\s*/g, 'function ');

        // Fix: <script, lang="ts"> -> <script lang="ts">
        content = content.replace(/<script\s*,\s+(lang|type|context)/g, '<script $1');

        // Fix stray commas in class attributes: class="foo, bar," -> class="foo bar"
        // Pattern: class="... , ..." or class="..., ..."
        content = content.replace(/\bclass="([^"]*),[^"]*"/g, (match, classes) => {
          const cleaned = classes
            .split(/\s*,\s*/)
            .map(c => c.trim())
            .filter(c => c)
            .join(' ');
          return `class="${cleaned}"`;
        });

        // Fix stray commas after element tags: <div, class= -> <div class=
        content = content.replace(/<(\w+)\s*,\s+/g, '<$1 ');

        // Fix stray commas in template tags: <p, class= -> <p class=
        content = content.replace(/(\{\w+)\s*,\s*/g, '$1 ');

        // Fix: import { ... , } -> import { ... }
        content = content.replace(/\{\s*([^}]*?)\s*,\s*\}/g, (match, imports) => {
          const items = imports
            .split(',')
            .map(i => i.trim())
            .filter(i => i && i !== ',');
          return `{ ${items.join(', ')} }`;
        });

        if (content !== original) {
          fs.writeFileSync(fullPath, content, 'utf8');
          fixed++;
          console.log(`✅ ${fullPath.replace(rootDir, '')}`);
        }
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
  }
}

console.log('🔧 Scanning and fixing Svelte files...');
walkDir(rootDir);

console.log(`\n✨ Results:`);
console.log(`   Scanned: ${scanned} files`);
console.log(`   Fixed: ${fixed} files`);
console.log(JSON.stringify({ scanned, fixed }, null, 2));
