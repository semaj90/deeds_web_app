#!/usr/bin/env node
/**
 * Svelte 4→5 Migration: createEventDispatcher → callback props
 *
 * Svelte 5 removed createEventDispatcher. This script converts:
 *   import { createEventDispatcher } from 'svelte';
 *   const dispatch = createEventDispatcher();
 *   dispatch('eventName', data);
 * To:
 *   // Props interface gets: oneventname?: (data: T) => void
 *   oneventname?.(data);
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

let totalFiles = 0;
let totalFixes = 0;
let filesModified = 0;
let skippedFiles = [];

function extractDispatchCalls(content) {
  // Find all dispatch('eventName', ...) calls
  const events = new Map(); // eventName -> payloadExpression

  // Pattern: dispatch('eventName', payload)
  const dispatchPattern = /dispatch\(\s*['"](\w+)['"]\s*(?:,\s*([^)]+))?\s*\)/g;
  let match;
  while ((match = dispatchPattern.exec(content)) !== null) {
    const eventName = match[1];
    const payload = match[2]?.trim();
    if (!events.has(eventName)) {
      events.set(eventName, payload || null);
    }
  }

  return events;
}

function eventNameToCallbackProp(eventName) {
  // Convert 'search' -> 'onsearch', 'filesAdded' -> 'onfilesadded', 'analysisComplete' -> 'onanalysiscomplete'
  // Svelte 5 convention: lowercase callback props
  return 'on' + eventName.toLowerCase();
}

function fixFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let modified = content;
    let fileFixes = 0;

    // Skip files that don't actually use createEventDispatcher
    if (!content.includes('createEventDispatcher')) return;

    // Skip commented-out references only
    const hasActiveDispatcher = content.split('\n').some(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
      return trimmed.includes('createEventDispatcher') &&
             !trimmed.includes('// const dispatch = createEventDispatcher') &&
             !trimmed.includes('// Removed') &&
             !trimmed.includes('// Migrated from createEventDispatcher');
    });

    if (!hasActiveDispatcher) return;

    // Skip heavily minified files (all on 1-2 lines)
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const avgLineLength = content.length / Math.max(lines.length, 1);
    if (avgLineLength > 500 && lines.length < 20) {
      skippedFiles.push({ path: filePath, reason: 'heavily minified' });
      return;
    }

    // Extract dispatch events
    const events = extractDispatchCalls(content);

    if (events.size === 0) {
      // Has createEventDispatcher import but no dispatch calls - just remove the import
      // This handles files that already partially migrated
    }

    // Step 1: Remove createEventDispatcher import
    // Pattern A: sole import
    modified = modified.replace(
      /^\s*import\s*\{\s*createEventDispatcher\s*\}\s*from\s*['"]svelte['"];?\s*\n?/gm,
      ''
    );
    if (modified !== content) fileFixes++;

    // Pattern B: part of multi-import - remove just createEventDispatcher
    const multiImportBefore = modified;
    modified = modified.replace(
      /import\s*\{([^}]*)\}\s*from\s*['"]svelte['"];?/g,
      (match, imports) => {
        const importList = imports.split(',').map(i => i.trim()).filter(i => i && i !== 'createEventDispatcher');
        if (importList.length === 0) return ''; // All imports were createEventDispatcher
        return `import { ${importList.join(', ')} } from 'svelte';`;
      }
    );
    if (modified !== multiImportBefore) fileFixes++;

    // Step 2: Remove const dispatch = createEventDispatcher<...>();
    // Handle typed and untyped variants, single and multi-line
    const dispatchDeclBefore = modified;

    // Single-line: const dispatch = createEventDispatcher<{ ... }>();
    modified = modified.replace(
      /^\s*const\s+dispatch\s*=\s*createEventDispatcher(?:<[^>]*>)?\s*\(\s*\)\s*;?\s*\n?/gm,
      ''
    );

    // Multi-line typed dispatcher declaration
    modified = modified.replace(
      /^\s*const\s+dispatch\s*=\s*createEventDispatcher<\{[\s\S]*?\}>\s*\(\s*\)\s*;?\s*\n?/gm,
      ''
    );

    if (modified !== dispatchDeclBefore) fileFixes++;

    // Step 3: Replace dispatch('eventName', data) with callback calls
    for (const [eventName, _payload] of events) {
      const callbackName = eventNameToCallbackProp(eventName);

      // Replace dispatch('eventName', payload) with callbackName?.(payload)
      const dispatchCallPattern = new RegExp(
        `dispatch\\(\\s*['"]${eventName}['"]\\s*,\\s*([^)]+)\\s*\\)`,
        'g'
      );
      const beforeReplace = modified;
      modified = modified.replace(dispatchCallPattern, (match, payload) => {
        return `${callbackName}?.(${payload.trim()})`;
      });

      // Replace dispatch('eventName') without payload
      modified = modified.replace(
        new RegExp(`dispatch\\(\\s*['"]${eventName}['"]\\s*\\)`, 'g'),
        `${callbackName}?.()`
      );

      if (modified !== beforeReplace) fileFixes++;
    }

    // Step 4: Add callback props to Props interface or $props() destructuring
    if (events.size > 0) {
      const callbackProps = [...events.entries()].map(([eventName, _payload]) => {
        const callbackName = eventNameToCallbackProp(eventName);
        return `${callbackName}?: (...args: any[]) => void`;
      });

      // Try to add to existing interface Props
      const propsInterfacePattern = /interface\s+Props\s*\{/;
      if (propsInterfacePattern.test(modified)) {
        modified = modified.replace(propsInterfacePattern, (match) => {
          return match + '\n  ' + callbackProps.join(';\n  ') + ';';
        });
        fileFixes++;
      }

      // Add to $props() destructuring
      const propsDestructPattern = /\}\s*(?::\s*Props\s*)?\s*=\s*\$props\(\)/;
      if (propsDestructPattern.test(modified)) {
        // Add callback prop names to the destructuring
        const callbackNames = [...events.entries()].map(([eventName]) =>
          eventNameToCallbackProp(eventName)
        );

        modified = modified.replace(propsDestructPattern, (match) => {
          const propsToAdd = callbackNames.join(', ');
          // Insert before the closing }
          return match.replace(/\}/, `, ${propsToAdd} }`);
        });
        fileFixes++;
      }
    }

    // Step 5: Remove leftover "Migrated from createEventDispatcher" comments if dispatch is gone
    modified = modified.replace(/^\s*\/\/\s*Migrated from createEventDispatcher.*\n?/gm, '');

    if (fileFixes > 0 && modified !== content) {
      // Clean up excessive blank lines (3+ → 2)
      modified = modified.replace(/\n{3,}/g, '\n\n');

      writeFileSync(filePath, modified, 'utf-8');
      filesModified++;
      totalFixes += fileFixes;

      const eventList = [...events.keys()].map(e => `${e} → ${eventNameToCallbackProp(e)}`).join(', ');
      console.log(`  ✓ Fixed ${fileFixes} pattern(s) in: ${path.relative(process.cwd(), filePath)}`);
      if (events.size > 0) {
        console.log(`    Events: ${eventList}`);
      }
    }

    totalFiles++;
  } catch (error) {
    console.error(`❌ Error in ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔧 Svelte 4→5: createEventDispatcher → callback props\n');
  console.log('   dispatch("event", data) → onevent?.(data)\n');

  const files = await glob('src/**/*.{svelte,ts}', {
    cwd: process.cwd(),
    ignore: ['**/_archive/**', '**/*.bak*', '**/*.backup*', '**/routes_parked/**', '**/node_modules/**'],
  });

  console.log(`Checking ${files.length} files\n`);

  for (const file of files) {
    fixFile(file);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Files checked: ${totalFiles}`);
  console.log(`   Files modified: ${filesModified}`);
  console.log(`   Total fixes: ${totalFixes}`);

  if (skippedFiles.length > 0) {
    console.log(`\n⚠️  Skipped (need manual fix):`);
    for (const skip of skippedFiles) {
      console.log(`   ${path.relative(process.cwd(), skip.path)} (${skip.reason})`);
    }
  }

  console.log('='.repeat(60));
}

main().catch(console.error);
