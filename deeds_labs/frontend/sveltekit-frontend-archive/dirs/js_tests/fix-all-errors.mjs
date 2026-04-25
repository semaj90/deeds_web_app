#!/usr/bin/env node

import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const srcDir = join(__dirname, 'src');

async function findAllFiles(dir, extensions = ['.svelte', '.ts', '.js']) {
  const results = [];

  async function walk(currentDir) {
    const items = await readdir(currentDir);

    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        if (!item.startsWith('.') && item !== 'node_modules') {
          await walk(fullPath);
        }
      } else {
        const ext = '.' + item.split('.').pop();
        if (extensions.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return results;
}

async function fixFile(filePath) {
  try {
    let content = await readFile(filePath, 'utf-8');
    let modified = false;

    // Fix 1: Remove double .js.js extensions
    if (content.includes('.js.js')) {
      console.log(`Fixing double .js.js extensions in: ${filePath}`);
      content = content.replace(/\.js\.js(?=['"])/g, '.js');
      modified = true;
    }

    // Fix 2: Fix melt-ui createToasterer → createToaster
    if (content.includes('createToasterer')) {
      console.log(`Fixing createToasterer → createToaster in: ${filePath}`);
      content = content.replace(/createToasterer/g, 'createToaster');
      modified = true;
    }

    // Fix 3: Fix marked.js renderer function signatures
    if (content.includes('renderer.link = (href, title, text)')) {
      console.log(`Fixing marked renderer function signature in: ${filePath}`);
      content = content.replace(
        /renderer\.link = \(href, title, text\) => \{/g,
        'renderer.link = ({ href, title, tokens }) => {'
      );
      content = content.replace(
        /const titleAttr = title \? ` title="\${title}"` : '';/g,
        'const titleAttr = title ? ` title="${title}"` : "";'
      );
      modified = true;
    }

    if (content.includes('renderer.image = (href, title, text)')) {
      console.log(`Fixing marked image renderer function signature in: ${filePath}`);
      content = content.replace(
        /renderer\.image = \(href, title, text\) => \{/g,
        'renderer.image = ({ href, title, text }) => {'
      );
      modified = true;
    }

    if (content.includes('renderer.code = (code, language)')) {
      console.log(`Fixing marked code renderer function signature in: ${filePath}`);
      content = content.replace(
        /renderer\.code = \(code, language\) => \{/g,
        'renderer.code = ({ text, lang }) => {'
      );
      content = content.replace(
        /const langClass = language \? ` class="language-\${language}"` : '';/g,
        'const langClass = lang ? ` class="language-${lang}"` : "";'
      );
      content = content.replace(/\${escapeHtml\(code\)}/g, '${escapeHtml(text)}');
      modified = true;
    }

    // Fix 4: Fix marked.parse async issue
    if (content.includes('renderedHtml = marked.parse(markdown);')) {
      console.log(`Fixing marked.parse async issue in: ${filePath}`);
      content = content.replace(
        /renderedHtml = marked\.parse\(markdown\);/g,
        'renderedHtml = await marked.parse(markdown);'
      );
      modified = true;
    }

    // Fix 5: Fix TipTap heading level type
    if (content.includes('toggleHeading({ level })')) {
      console.log(`Fixing TipTap heading level type in: ${filePath}`);
      content = content.replace(
        /toggleHeading\(\{ level \}\)/g,
        'toggleHeading({ level: level as Level })'
      );
      modified = true;
    }

    // Fix 6: Fix event target type issues
    if (
      content.includes('e.target.value') &&
      !content.includes('(e.target as HTMLInputElement).value')
    ) {
      console.log(`Fixing event target type issues in: ${filePath}`);
      content = content.replace(/e\.target\.value/g, '(e.target as HTMLInputElement).value');
      modified = true;
    }

    // Fix 7: Fix createDialog open parameter
    if (content.includes('open: isOpen,')) {
      console.log(`Fixing createDialog open parameter in: ${filePath}`);
      content = content.replace(/open: isOpen,/g, 'open: writable(isOpen),');
      modified = true;
    }

    // Fix 8: Fix invalid Svelte head tags
    if (content.includes('</svelte:head>') && !content.includes('<svelte:head>')) {
      console.log(`Fixing invalid svelte:head tags in: ${filePath}`);
      content = content.replace(/<title>/g, '<svelte:head>\n  <title>');
      content = content.replace(/<\/title>/g, '</title>\n</svelte:head>');
      modified = true;
    }

    // Fix 9: Add ARIA roles for mouse event handlers
    if (content.includes('on:mouseenter') || content.includes('on:mouseleave')) {
      console.log(`Adding ARIA roles for mouse handlers in: ${filePath}`);
      content = content.replace(/<div([^>]*)(on:mouseenter[^>]*>)/g, '<div$1role="button" $2');
      modified = true;
    }

    // Fix 10: Add form label associations
    if (content.includes('<label') && content.includes('<select') && !content.includes('for=')) {
      console.log(`Adding form label associations in: ${filePath}`);
      // This is a basic fix - for more complex cases, manual editing might be needed
      let labelCount = 0;
      content = content.replace(
        /<label([^>]*)class="([^"]*)"([^>]*)>([^<]*)<\/label>/g,
        (match, before, className, after, labelText) => {
          labelCount++;
          const id = `field-${labelCount}`;
          return `<label${before}class="${className}"${after} for="${id}">${labelText}</label>`;
        }
      );

      let fieldCount = 0;
      content = content.replace(
        /<(select|input)([^>]*class="[^"]*"[^>]*)>/g,
        (match, tag, attributes) => {
          fieldCount++;
          const id = `field-${fieldCount}`;
          if (!attributes.includes('id=')) {
            return `<${tag}${attributes} id="${id}">`;
          }
          return match;
        }
      );

      if (labelCount > 0 || fieldCount > 0) {
        modified = true;
      }
    }

    if (modified) {
      await writeFile(filePath, content, 'utf-8');
      console.log(`✓ Fixed: ${filePath}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔧 Starting comprehensive error fix...\n');

  try {
    const files = await findAllFiles(srcDir);
    console.log(`Found ${files.length} files to process\n`);

    let fixedCount = 0;

    for (const file of files) {
      const wasFixed = await fixFile(file);
      if (wasFixed) {
        fixedCount++;
      }
    }

    console.log(`\n✅ Fixed ${fixedCount} files out of ${files.length} processed`);
    console.log('\n🔧 Next steps:');
    console.log('1. Run: npm run check');
    console.log('2. Check for remaining errors');
    console.log('3. Create missing store files if needed');
  } catch (error) {
    console.error('❌ Error during fix process:', error);
  }
}

main().catch(console.error);
