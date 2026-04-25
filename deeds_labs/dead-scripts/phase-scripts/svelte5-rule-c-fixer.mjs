#!/usr/bin/env node

/**
 * Svelte 5 Migration Fixer: Rule C - Event Handler Syntax
 *
 * Converts legacy event handlers to modern Svelte 5 syntax.
 * Pattern: on:click={handler} → onclick={handler}
 * Pattern: on:change={handler} → onchange={handler}
 */

import glob from 'fast-glob';
import fs from 'fs';

async function fixEventHandlerSyntax() {
  console.log('🔧 Starting Rule C: Event Handler Syntax Fixer');

  // Find all Svelte files
  const files = await glob([
    'src/**/*.svelte',
    '!node_modules/**',
    '!dist/**',
    '!build/**'
  ]);

  let fixedCount = 0;
  let totalFiles = files.length;

  console.log(`📁 Found ${totalFiles} Svelte files to check`);

  // Common event types to convert
  const eventTypes = [
    'click', 'change', 'input', 'submit', 'focus', 'blur',
    'mouseenter', 'mouseleave', 'mouseover', 'mouseout',
    'keydown', 'keyup', 'keypress', 'scroll', 'resize',
    'load', 'unload', 'beforeunload', 'contextmenu',
    'dblclick', 'mousedown', 'mouseup', 'mousemove',
    'touchstart', 'touchend', 'touchmove', 'dragstart',
    'dragend', 'dragover', 'drop', 'wheel'
  ];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      let modified = false;
      let newContent = content;

      // Convert each event type
      for (const eventType of eventTypes) {
        const pattern = new RegExp(`on:${eventType}=`, 'g');
        const replacement = `on${eventType}=`;

        if (pattern.test(newContent)) {
          newContent = newContent.replace(pattern, replacement);
          console.log(`✅ Fixed on:${eventType} → on${eventType} in ${file}`);
          modified = true;
        }
      }

      // Special case: on:keydown with modifiers
      const keydownModifierPattern = /on:keydown\{([^}]+)\}/g;
      newContent = newContent.replace(keydownModifierPattern, (match, handler) => {
        console.log(`✅ Fixed on:keydown modifier in ${file}: ${match}`);
        modified = true;
        return `onkeydown={${handler}}`;
      });

      // Special case: on:click with preventDefault/stopPropagation
      const clickModifierPattern = /on:click=\{([^}]+)\}/g;
      newContent = newContent.replace(clickModifierPattern, (match, handler) => {
        console.log(`✅ Fixed on:click → onclick in ${file}: ${match}`);
        modified = true;
        return `onclick={${handler}}`;
      });

      if (modified) {
        fs.writeFileSync(file, newContent);
        fixedCount++;
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Rule C Complete!`);
  console.log(`📊 Fixed ${fixedCount} files out of ${totalFiles} total files`);
  console.log(`📈 Success rate: ${((fixedCount / totalFiles) * 100).toFixed(1)}%`);
}

// Run the fixer
fixEventHandlerSyntax().catch(console.error);