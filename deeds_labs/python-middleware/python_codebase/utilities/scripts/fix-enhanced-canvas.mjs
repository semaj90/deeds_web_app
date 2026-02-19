#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const file = 'sveltekit-frontend/src/lib/components/EnhancedCanvasEditor.svelte';

const content = fs.readFileSync(file, 'utf8');

let fixed = content;

// Fix case statement commas
fixed = fixed.replace(/case\s*,\s*"([^"]+)"/g, 'case "$1"');

// Fix return: null (colon instead of semicolon)
fixed = fixed.replace(/return:\s*null/g, 'return null;');

// Fix return: Promise patterns
fixed = fixed.replace(/Promise<any>\s*\{[^}]*return:\s*/g, match => match.replace('return:', 'return'));

// Fix SVG path with stray commas: "M size 0 L, 0, 0, 0 size" -> "M size 0 L 0 0 0 size"
fixed = fixed.replace(/d="M \$\{[^}]+\} 0 L, 0, 0, 0/g, match => {
  return match.replace(/L, 0, 0, 0/g, 'L 0 0 0');
});

// Fix typing issues: (fabric as: any) -> (fabric as any)
fixed = fixed.replace(/\(\s*fabric\s+as:\s*any\s*\)/g, '(fabric as any)');

// Fix Fuse constructor: (Fuse, as: any) -> (Fuse as any)
fixed = fixed.replace(/\(\s*Fuse\s*,\s*as:\s*any\s*\)/g, '(Fuse as any)');

// Fix (fabric as, any) -> (fabric as any)
fixed = fixed.replace(/\(\s*fabric\s+as\s*,\s*any\s*\)/g, '(fabric as any)');

// Fix imgUrl as: string -> imgUrl as string
fixed = fixed.replace(/\bas:\s*string/g, 'as string');

// Fix clearTimeout(autoSaveTimeout as: any) -> clearTimeout(autoSaveTimeout as any)
fixed = fixed.replace(/as:\s*any\)/g, 'as any)');

// Fix dropdown CSS background-color: white;, -> white;
fixed = fixed.replace(/white;,\s*border:/g, 'white; border:');

// Fix Objects: count |, Selected -> Objects: count | Selected
fixed = fixed.replace(/\|\s*,\s*Selected/g, '| Selected');

fs.writeFileSync(file, fixed, 'utf8');
console.log('✅ Fixed EnhancedCanvasEditor.svelte');
