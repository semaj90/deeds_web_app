#!/usr/bin/env node
/**
 * Advanced Batch Fixer v2 with:
 * 1. Idempotent fixing (only report when content actually changes)
 * 2. onMount(async) → onMount(() => { (async () => { ... })() }) transformation
 * 3. Barrel export auto-generation (safe: only add if file exists)
 * 4. Surgical Bits-UI v2 report (exact line/column locations)
 * 5. Error-Brain integration (Phase 35-38): Event publishing for progress tracking
 */

import { exec } from 'child_process';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const uiDir = path.join(srcDir, 'lib', 'components', 'ui');
const barrelPath = path.join(uiDir, 'index.ts');

// Error-Brain integration (optional dynamic import)
let getTransport = null;
let createEvent = null;
try {
  const transportMod = await import('../src/lib/server/error-brain/transport/factory.ts');
  const eventsMod = await import('../src/lib/server/error-brain/events.ts');
  getTransport = transportMod.getTransport;
  createEvent = eventsMod.createEvent;
} catch (e) {
  console.log('ℹ️  Error-Brain transport not available (optional)');
}

// Parse CLI args
const args = process.argv.slice(2);
const mode = args[0] || '--analyze';
const DRY_RUN = args.includes('--dry-run');

// ============= CONSTANTS =============
const ONMOUNT_ASYNC_PATTERN = /onMount\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/g;
const BITS_UI_DIALOG_PATTERN = /<Dialog\s*(?!.*(?:\.Trigger|\.Content|\.Close))/;
const BITS_UI_FIELD_PATTERN = /<Field\s*(?!.*control)/;

let changedCount = 0;
let noChangeCount = 0;
let currentRunId = null;

// ============= ERROR-BRAIN HELPERS =============

async function publishEvent(type, data) {
  if (!getTransport || !createEvent) return;
  try {
    const transport = getTransport();
    const event = createEvent(type, { ...data, runId: currentRunId });
    await transport.publish(event);
  } catch (e) {
    // Silent fail - transport is optional
  }
}

// ============= MAIN FLOW =============

async function main() {
  console.log('\n🚀 Advanced Batch Fixer v2 (Safe + Idempotent)');
  console.log(`📝 Mode: ${mode}`);
  console.log(`🔒 Dry-run: ${DRY_RUN ? 'YES' : 'NO'}\n`);

  // Generate run ID for error-brain tracking
  currentRunId = `batch-v2-${Date.now()}`;

  try {
    // Publish run started event
    await publishEvent('run.started', {
      mode,
      dryRun: DRY_RUN,
      timestamp: new Date().toISOString()
    });

    if (mode === '--analyze' || mode.includes('analyze')) {
      await analyzeAll();
    } else if (mode === '--fix-onmount-async') {
      await fixOnMountAsync();
    } else if (mode === '--fix-barrels') {
      await fixBarrels();
    } else if (mode === '--report-barrels') {
      await reportBarrels();
    } else if (mode === '--report-bitsui') {
      await reportBitsUI();
    } else {
      console.log(`Unknown mode: ${mode}`);
      console.log('\nAvailable modes:');
      console.log('  --analyze              (default: scan and categorize)');
      console.log('  --fix-onmount-async    (fix onMount(async) → IIFE pattern)');
      console.log('  --fix-barrels          (auto-add missing barrel exports)');
      console.log('  --report-barrels       (detailed barrel issue report)');
      console.log('  --report-bitsui        (surgical Bits-UI v2 locations)');
    }

    // Final summary
    if (changedCount > 0 || noChangeCount > 0) {
      console.log(`\n✨ Summary:`);
      console.log(`  ✅ Changed: ${changedCount}`);
      console.log(`  ⏭️  No change (idempotent skip): ${noChangeCount}`);
    }

    // Publish run completed event
    await publishEvent('run.completed', {
      changedCount,
      noChangeCount,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Error:', err.message);

    // Publish run failed event
    await publishEvent('run.failed', {
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });

    process.exit(1);
  }
}

// ============= ANALYZE ALL =============

async function analyzeAll() {
  const files = await findSvelteFiles();
  console.log(`📂 Found ${files.length} Svelte files\n`);

  const results = {
    onMountAsync: [],
    bitsUI: [],
    barrels: []
  };

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');

    // Check onMount(async)
    if (ONMOUNT_ASYNC_PATTERN.test(content)) {
      results.onMountAsync.push(file);
    }

    // Check Bits-UI Dialog/Field patterns (basic)
    if (content.includes('<Dialog') || content.includes('<Field')) {
      results.bitsUI.push(file);
    }

    // Check for import { X } from '$lib/components/ui'
    const uiImportMatch = content.match(/import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]?\$lib\/components\/ui['"]?/);
    if (uiImportMatch) {
      results.barrels.push(file);
    }
  }

  console.log(`🔴 HIGH PRIORITY:\n`);
  console.log(`  1. onMount(async) fixes needed: ${results.onMountAsync.length} files`);
  console.log(`     → Run: node scripts/batch-merger-fixer-v2.mjs --fix-onmount-async\n`);

  console.log(`  2. Barrel exports drift: ${results.barrels.length} files`);
  console.log(`     → Run: node scripts/batch-merger-fixer-v2.mjs --report-barrels`);
  console.log(`     → Then: node scripts/batch-merger-fixer-v2.mjs --fix-barrels\n`);

  console.log(`🟡 MEDIUM PRIORITY:\n`);
  console.log(`  3. Bits-UI v2 verification: ${results.bitsUI.length} files`);
  console.log(`     → Run: node scripts/batch-merger-fixer-v2.mjs --report-bitsui\n`);

  // Summarize top files
  if (results.onMountAsync.length > 0) {
    console.log(`📁 Top files with onMount(async):`);
    results.onMountAsync.slice(0, 5).forEach((f, i) => {
      console.log(`   ${i + 1}. ${path.relative(rootDir, f)}`);
    });
    if (results.onMountAsync.length > 5) {
      console.log(`   ... and ${results.onMountAsync.length - 5} more`);
    }
  }
}

// ============= FIX ONMOUNT ASYNC =============

async function fixOnMountAsync() {
  const files = await findSvelteFiles();
  const problematicFiles = [];

  console.log('🔧 Fixing onMount(async) → onMount(() => { (async () => { ... })() })\n');

  for (const file of files) {
    let content = await fs.readFile(file, 'utf8');
    const originalContent = content;

    // Match: onMount(async () => { ... })
    // We need to wrap the async body in IIFE: onMount(() => { (async () => { ... })() })

    // Use a simpler regex that finds the whole pattern up to the matching closing paren
    let newContent = originalContent;
    let changed = false;

    // Replace onMount(async () => { BODY }) with onMount(() => { (async () => { BODY })() })
    newContent = newContent.replace(
      /onMount\s*\(\s*async\s*\(\s*\)\s*=>\s*\{([^]*?)\n\s*\}\s*\);/g,
      (match, body) => {
        changed = true;
        // Preserve original indentation of body
        const lines = body.split('\n');
        const indentedBody = lines
          .map((line, idx) => {
            if (idx === 0) return line; // First line keeps original spacing
            if (line.trim() === '') return line; // Blank lines
            return '  ' + line; // Indent subsequent lines by 2 more spaces
          })
          .join('\n');

        return `onMount(() => {
    (async () => {${indentedBody}
    })();
  });`;
      }
    );

    if (newContent !== originalContent) {
      changedCount++;
      if (!DRY_RUN) {
        await fs.writeFile(file, newContent, 'utf8');
        console.log(`✅ Fixed: ${path.relative(rootDir, file)}`);
      } else {
        console.log(`[DRY] Would fix: ${path.relative(rootDir, file)}`);
      }
    } else {
      noChangeCount++;
    }
  }
}// ============= REPORT BARRELS =============

async function reportBarrels() {
  console.log('📊 Barrel Export Analysis\n');
  console.log('Checking $lib/components/ui imports for missing exports...\n');

  const barrelIndexPath = path.join(srcDir, 'lib', 'components', 'ui', 'index.ts');
  let barrelContent = '';
  try {
    barrelContent = await fs.readFile(barrelIndexPath, 'utf8');
  } catch {
    console.log(`⚠️  Barrel index not found: ${barrelIndexPath}`);
    return;
  }

  const files = await findSvelteFiles();
  const uiImportRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]?\$lib\/components\/ui['"]?/g;

  const missingExports = new Set();
  const issues = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    let match;

    while ((match = uiImportRegex.exec(content)) !== null) {
      const imports = match[1].split(',').map(s => s.trim());

      for (const imp of imports) {
        // Check if export exists in barrel
        const exportPattern = new RegExp(
          `export\\s*\\{\\s*(?:default\\s+as\\s+)?${imp}|export\\s+\\*\\s+from\\s+['"]\\./[^'"]*${imp}`,
          'i'
        );

        if (!exportPattern.test(barrelContent)) {
          missingExports.add(imp);
          issues.push({
            file: path.relative(rootDir, file),
            component: imp
          });
        }
      }
    }
  }

  if (issues.length === 0) {
    console.log('✅ All barrel exports are up to date!\n');
    return;
  }

  console.log(`🔴 Found ${missingExports.size} missing exports:\n`);

  const grouped = {};
  issues.forEach(({ component, file }) => {
    if (!grouped[component]) grouped[component] = [];
    grouped[component].push(file);
  });

  Object.entries(grouped).forEach(([comp, files]) => {
    console.log(`  ${comp}:`);
    files.slice(0, 3).forEach(f => console.log(`    - ${f}`));
    if (files.length > 3) console.log(`    ... and ${files.length - 3} more`);
  });

  console.log(`\n💡 Run: node scripts/batch-merger-fixer-v2.mjs --fix-barrels`);
}

// ============= FIX BARRELS (PRODUCTION VERSION) =============

async function fixBarrels() {
  console.log('🔧 Auto-generating missing barrel exports (safety-checked)\n');

  if (!existsSync(barrelPath)) {
    console.log(`⚠️  Creating barrel index: ${barrelPath}`);
  }

  const srcDirPath = srcDir;
  const files = listRouteFiles(srcDirPath);

  const importedSymbols = new Set();
  for (const f of files) {
    if (!f.endsWith('.ts')) continue;
    const names = collectBarrelImports(f);
    for (const n of names) importedSymbols.add(n);
  }

  let barrelText = existsSync(barrelPath) ? readTextSync(barrelPath) : '// Auto-generated UI component exports\n';

  const toAppend = [];
  for (const symbol of [...importedSymbols].sort()) {
    if (barrelAlreadyExports(barrelText, symbol)) continue;

    const target = resolveUiComponentFile(symbol);
    if (!target) {
      console.log(`   ⚠️  ${symbol}: no matching file found (skipped)`);
      continue;
    }

    toAppend.push(makeExportLine(symbol, target));
    console.log(`   ✅ Will add: ${symbol}`);
  }

  if (!toAppend.length) {
    console.log('✨ No missing exports found.\n');
    return { added: 0 };
  }

  // Build final text with newline hygiene
  let next = barrelText;
  if (!next.endsWith('\n')) next += '\n';
  next += '\n// AUTO-GENERATED EXPORTS (batch-merger-fixer)\n';
  next += toAppend.join('\n') + '\n';

  if (!DRY_RUN) {
    const changed = writeIfChanged(barrelPath, next);
    if (changed) {
      console.log(`\n✅ Barrel updated: +${toAppend.length} exports`);
      changedCount++;
    } else {
      console.log('\n✨ Barrel already up to date (no write).');
    }
  } else {
    console.log(`\n[DRY] Would add ${toAppend.length} exports to barrel index`);
  }

  return { added: toAppend.length };
}

// ============= REPORT BITS-UI (SURGICAL VERSION) =============

async function reportBitsUI() {
  console.log('🎨 Bits-UI v2 Component Analysis (Surgical Report)\n');
  console.log('Scanning for Dialog and Field components with exact locations...\n');

  const files = await findSvelteFiles();
  const issues = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');

    // Only analyze files with actual Bits-UI components
    if (!content.includes('<Dialog') && !content.includes('<Field')) continue;

    const bits = analyzeBitsUiSvelte(content);

    if (bits.dialog) {
      issues.push({
        file: path.relative(rootDir, file),
        type: 'Dialog',
        location: bits.dialog.at,
        missing: bits.dialog.missing
      });
    }

    if (bits.field) {
      issues.push({
        file: path.relative(rootDir, file),
        type: 'Field',
        location: bits.field.at,
        signals: bits.field.signals
      });
    }
  }

  if (issues.length === 0) {
    console.log('✅ No Bits-UI v2 pattern issues detected!\n');
    return;
  }

  console.log(`🔴 Found ${issues.length} Bits-UI v2 issues:\n`);
  issues.forEach(issue => {
    const loc = issue.location;
    console.log(`📄 ${issue.file}:${loc.line}:${loc.col}`);
    console.log(`   Type: ${issue.type}`);

    if (issue.missing && issue.missing.length > 0) {
      console.log(`   Missing: ${issue.missing.join(', ')}`);
    } else if (issue.signals) {
      console.log(`   Signals:`);
      console.log(`     - hasControl: ${issue.signals.hasControl}`);
      console.log(`     - hasLabel: ${issue.signals.hasLabel}`);
      console.log(`     - hasErrors: ${issue.signals.hasErrors}`);
    }
    console.log();
  });

  console.log(`💡 Use file:line:col above to jump to exact location in editor.`);
}// ============= UTILITIES =============

async function findSvelteFiles() {
  const results = [];

  async function walk(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          }
        } else if (entry.name.endsWith('.svelte')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  await walk(srcDir);
  return results;
}

// ============= IDEMPOTENCY HELPERS =============

function readTextSync(p) {
  return fsSync.readFileSync(p, 'utf8');
}

function existsSync(p) {
  return fsSync.existsSync(p);
}

function writeIfChanged(filePath, nextText) {
  const prev = existsSync(filePath) ? readTextSync(filePath) : null;
  if (prev === nextText) return false;
  fsSync.writeFileSync(filePath, nextText, 'utf8');
  return true;
}

// ============= LINE/COLUMN HELPERS =============

function indexToLineCol(text, idx) {
  let line = 1, col = 1;
  for (let i = 0; i < idx; i++) {
    if (text.charCodeAt(i) === 10) { line++; col = 1; }
    else col++;
  }
  return { line, col };
}

function firstIndexOfAny(text, needles) {
  let best = -1;
  for (const n of needles) {
    const i = text.indexOf(n);
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  return best;
}

// ============= BITS-UI ANALYZER =============

function analyzeBitsUiSvelte(text) {
  // Dialog
  const dialogIdx = firstIndexOfAny(text, ['<Dialog', '<Dialog ']);
  const dialog = dialogIdx !== -1 ? {
    at: indexToLineCol(text, dialogIdx),
    missing: [
      text.includes('<Dialog.Trigger') ? null : 'Dialog.Trigger',
      text.includes('<Dialog.Content') ? null : 'Dialog.Content',
      text.includes('<Dialog.Close') ? null : 'Dialog.Close',
    ].filter(Boolean)
  } : null;

  // Field
  const fieldIdx = firstIndexOfAny(text, ['<Field', '<Field ']);
  const field = fieldIdx !== -1 ? {
    at: indexToLineCol(text, fieldIdx),
    signals: {
      hasControl: text.includes('let:control') || text.includes('slot="control"') || text.includes('<Field.Control'),
      hasLabel: text.includes('<Field.Label') || text.includes('slot="label"'),
      hasErrors: text.includes('<Field.Errors') || text.includes('slot="errors"')
    }
  } : null;

  return { dialog, field };
}

// ============= BARREL HELPERS =============

function listRouteFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    try {
      for (const ent of fsSync.readdirSync(cur, { withFileTypes: true })) {
        const p = path.join(cur, ent.name);
        if (ent.isDirectory()) {
          if (!ent.name.startsWith('.') && ent.name !== 'node_modules') {
            stack.push(p);
          }
        } else if (ent.isFile() && (p.endsWith('.ts') || p.endsWith('.svelte'))) {
          out.push(p);
        }
      }
    } catch {
      // Skip
    }
  }
  return out;
}

function collectBarrelImports(filePath) {
  const text = readTextSync(filePath);
  const names = new Set();

  // Simple regex for: import { X, Y } from '$lib/components/ui'
  const re = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]?\$lib\/components\/ui['"]?/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const imports = match[1].split(',').map(s => s.trim());
    for (const imp of imports) {
      const cleanName = imp.split(/\s+as\s+/)[0].trim();
      if (cleanName) names.add(cleanName);
    }
  }

  return names;
}

function resolveUiComponentFile(symbol) {
  const candidates = [
    `${symbol}.svelte`,
    `${symbol.toLowerCase()}.svelte`,
    `${symbol}.ts`,
    `${symbol.toLowerCase()}.ts`,
    path.join(symbol, 'index.ts'),
    path.join(symbol.toLowerCase(), 'index.ts'),
    path.join(symbol, `${symbol}.svelte`),
    path.join(symbol.toLowerCase(), `${symbol.toLowerCase()}.svelte`)
  ].map(rel => path.join(uiDir, rel));

  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

function barrelAlreadyExports(barrelText, symbol) {
  const re = new RegExp(`export\\s*\\{\\s*default\\s+as\\s+${symbol}\\s*\\}\\s*from\\s*['"]\\./`, 'm');
  return re.test(barrelText);
}

function makeExportLine(symbol, targetAbsPath) {
  const rel = './' + path.relative(uiDir, targetAbsPath).replaceAll('\\', '/');
  return `export { default as ${symbol} } from '${rel}';`;
}

main().catch(console.error);
