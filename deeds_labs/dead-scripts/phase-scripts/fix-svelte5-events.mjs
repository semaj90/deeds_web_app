#!/usr/bin/env node
/**
 * Svelte 5 Event Handler Migration Script
 * Converts on:event to onevent syntax for Svelte 5
 *
 * Usage:
 *   node scripts/fix-svelte5-events.mjs src            # Dry-run (default)
 *   node scripts/fix-svelte5-events.mjs src --apply    # Apply changes
 *   node scripts/fix-svelte5-events.mjs src --verbose  # Show all changes
 */

import { readFileSync, writeFileSync } from 'fs';
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';

const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const TARGET_DIR = process.argv[2] || 'src';

console.log('🔄 Svelte 5 Event Handler Migration\n');
console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN (use --apply to apply)' : 'APPLYING CHANGES'}`);
console.log(`   Target: ${TARGET_DIR}\n`);

// Event handler replacements
const replacements = [
  { old: /on:click=/g, new: 'onclick=', name: 'click' },
  { old: /on:submit=/g, new: 'onsubmit=', name: 'submit' },
  { old: /on:change=/g, new: 'onchange=', name: 'change' },
  { old: /on:input=/g, new: 'oninput=', name: 'input' },
  { old: /on:focus=/g, new: 'onfocus=', name: 'focus' },
  { old: /on:blur=/g, new: 'onblur=', name: 'blur' },
  { old: /on:keydown=/g, new: 'onkeydown=', name: 'keydown' },
  { old: /on:keyup=/g, new: 'onkeyup=', name: 'keyup' },
  { old: /on:keypress=/g, new: 'onkeypress=', name: 'keypress' },
  { old: /on:mouseenter=/g, new: 'onmouseenter=', name: 'mouseenter' },
  { old: /on:mouseleave=/g, new: 'onmouseleave=', name: 'mouseleave' },
  { old: /on:mouseover=/g, new: 'onmouseover=', name: 'mouseover' },
  { old: /on:mouseout=/g, new: 'onmouseout=', name: 'mouseout' },
  { old: /on:load=/g, new: 'onload=', name: 'load' },
  { old: /on:dragover=/g, new: 'ondragover=', name: 'dragover' },
  { old: /on:dragleave=/g, new: 'ondragleave=', name: 'dragleave' },
  { old: /on:drop=/g, new: 'ondrop=', name: 'drop' },
  { old: /on:scroll=/g, new: 'onscroll=', name: 'scroll' },
  { old: /on:touchstart=/g, new: 'ontouchstart=', name: 'touchstart' },
  { old: /on:touchend=/g, new: 'ontouchend=', name: 'touchend' },
  { old: /on:touchmove=/g, new: 'ontouchmove=', name: 'touchmove' },
  { old: /on:contextmenu=/g, new: 'oncontextmenu=', name: 'contextmenu' },
  { old: /on:dblclick=/g, new: 'ondblclick=', name: 'dblclick' },
  { old: /on:mousedown=/g, new: 'onmousedown=', name: 'mousedown' },
  { old: /on:mouseup=/g, new: 'onmouseup=', name: 'mouseup' },
  { old: /on:mousemove=/g, new: 'onmousemove=', name: 'mousemove' },
  { old: /on:wheel=/g, new: 'onwheel=', name: 'wheel' },
  { old: /on:resize=/g, new: 'onresize=', name: 'resize' },
  { old: /on:error=/g, new: 'onerror=', name: 'error' },
  { old: /on:animationend=/g, new: 'onanimationend=', name: 'animationend' },
  { old: /on:transitionend=/g, new: 'ontransitionend=', name: 'transitionend' },
];

// Stats tracking
const stats = {
  filesScanned: 0,
  filesWithChanges: 0,
  totalReplacements: 0,
  byEvent: {},
  changedFiles: []
};

const includeQuarantined = process.argv.includes('--include-quarantined');

const patterns = [
  `${TARGET_DIR}/**/*.svelte`,
  ...(includeQuarantined ? ['../quarantined-routes/**/*.svelte'] : [])
];

async function processFile(file) {
  try {
    let content = readFileSync(file, 'utf-8');
    let modified = false;
    let fileReplacements = [];

    for (const { old, new: newVal, name } of replacements) {
      const matches = content.match(old);
      if (matches) {
        for (const match of matches) {
          fileReplacements.push({
            event: name,
            original: match,
            replacement: newVal
          });
          stats.byEvent[name] = (stats.byEvent[name] || 0) + 1;
        }
        modified = true;
        if (!DRY_RUN) {
          content = content.replace(old, newVal);
        }
      }
    }

    if (modified) {
      const relativePath = path.relative(process.cwd(), file);
      stats.filesWithChanges++;
      stats.totalReplacements += fileReplacements.length;
      stats.changedFiles.push({
        file: relativePath,
        changes: fileReplacements.length,
        events: fileReplacements.map(r => r.event)
      });

      if (VERBOSE || DRY_RUN) {
        console.log(`📄 ${relativePath}`);
        for (const rep of fileReplacements) {
          console.log(`   ${rep.original} → ${rep.replacement}`);
        }
        console.log('');
      } else {
        console.log(`✓ ${relativePath}: ${fileReplacements.length} replacements`);
      }

      if (!DRY_RUN) {
        writeFileSync(file, content, 'utf-8');
      }
    }

    stats.filesScanned++;
  } catch (err) {
    console.error(`❌ Error processing ${file}:`, err.message);
  }
}

async function main() {
  for (const pattern of patterns) {
    const files = glob.sync(pattern, { cwd: process.cwd(), absolute: true });

    for (const file of files) {
      await processFile(file);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log('='.repeat(60));
  console.log(`   Files scanned:      ${stats.filesScanned}`);
  console.log(`   Files with changes: ${stats.filesWithChanges}`);
  console.log(`   Total replacements: ${stats.totalReplacements}`);
  console.log('');
  console.log('   Changes by event type:');

  const sortedEvents = Object.entries(stats.byEvent)
    .sort((a, b) => b[1] - a[1]);

  for (const [event, count] of sortedEvents) {
    console.log(`     on:${event} → on${event}: ${count}`);
  }

  console.log('');

  if (DRY_RUN) {
    console.log('💡 This was a DRY-RUN. To apply fixes, run:');
    console.log(`   node scripts/fix-svelte5-events.mjs ${TARGET_DIR} --apply`);
  } else {
    console.log('✅ All event handlers migrated!');
  }

  // Save report for knowledge graph
  const report = {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'applied',
    stats: {
      filesScanned: stats.filesScanned,
      filesWithChanges: stats.filesWithChanges,
      totalReplacements: stats.totalReplacements,
      byEvent: stats.byEvent
    },
    changedFiles: stats.changedFiles
  };

  await fs.writeFile(
    'logs/svelte5-events-report.json',
    JSON.stringify(report, null, 2)
  );
  console.log('\n📝 Report saved to: logs/svelte5-events-report.json');
}

main().catch(console.error);
