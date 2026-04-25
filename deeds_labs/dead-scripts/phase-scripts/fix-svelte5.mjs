#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '..', 'src');

function walkDir(dir, ext = '.svelte') {
  const files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(fullPath, ext));
      } else if (entry.name.endsWith(ext)) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Skip unreadable directories
  }
  return files;
}

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    // Fix 1: on: directives → event attributes (with modifiers, with or without =)
    content = content.replace(/on:click(\|[a-zA-Z|]+)?(?=[>\s])/g, 'onclick');
    content = content.replace(/on:submit(\|[a-zA-Z|]+)?(?=[>\s])/g, 'onsubmit');
    content = content.replace(/on:change(\|[a-zA-Z|]+)?(?=[>\s])/g, 'onchange');
    content = content.replace(/on:input(\|[a-zA-Z|]+)?(?=[>\s])/g, 'oninput');
    content = content.replace(/on:keydown(\|[a-zA-Z|]+)?(?=[>\s])/g, 'onkeydown');
    content = content.replace(/on:keyup(\|[a-zA-Z|]+)?(?=[>\s])/g, 'onkeyup');
    content = content.replace(/on:focus(\|[a-zA-Z|]+)?(?=[>\s])/g, 'onfocus');
    content = content.replace(/on:blur(\|[a-zA-Z|]+)?(?=[>\s])/g, 'onblur');
    content = content.replace(/on:mouseenter(\|[a-zA-Z|]+)?(?=[>\s])/g, 'onmouseenter');
    content = content.replace(/on:mouseleave(\|[a-zA-Z|]+)?(?=[>\s])/g, 'onmouseleave');
    content = content.replace(/on:mouseover(\|[a-zA-Z|]+)?(?=[>\s])/g, 'onmouseover');
    content = content.replace(/on:mouseout(\|[a-zA-Z|]+)?(?=[>\s])/g, 'onmouseout');
    content = content.replace(/on:dblclick(\|[a-zA-Z|]+)?(?=[>\s])/g, 'ondblclick');

    // Fix 2: lucide-svelte imports
    content = content.replace(/import\s+(\w+)\s+from\s+["']lucide-svelte\/icons\/[^"']+["']/g, 'import { $1 } from "lucide-svelte"');
    content = content.replace(/from\s+["']lucide-svelte\/icons["']/g, 'from "lucide-svelte"');

    // Fix 3: self-closing non-void tags
    content = content.replace(/<div([^>]*?)\s*\/>/g, '<div$1></div>');
    content = content.replace(/<span([^>]*?)\s*\/>/g, '<span$1></span>');
    content = content.replace(/<section([^>]*?)\s*\/>/g, '<section$1></section>');

    // Fix 4: <svelte:component this={X} /> → <X />
    content = content.replace(/<svelte:component\s+this=\{([^}]+)\}([^>]*?)\s*\/>/g, '<$1$2 />');

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    return false;
  } catch (e) {
    console.error(`Error processing ${filePath}:`, e.message);
    return false;
  }
}

console.log('🔧 Svelte 5 Migration Cleanup Starting...\n');

const files = walkDir(srcDir);
let fixed = 0;

for (const file of files) {
  if (fixFile(file)) {
    fixed++;
    console.log(`✓ ${path.relative(srcDir, file)}`);
  }
}

console.log(`\n✅ Fixed ${fixed}/${files.length} files`);
console.log('\n🚀 Ready to build!');
