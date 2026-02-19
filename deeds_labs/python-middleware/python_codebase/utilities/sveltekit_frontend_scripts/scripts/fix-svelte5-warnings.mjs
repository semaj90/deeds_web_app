#!/usr/bin/env node
/**
 * Fix Svelte 5 Browser Console Warnings
 * Fixes deprecation warnings that show as gold/yellow notifications
 */
import { glob } from 'glob';
import fs from 'fs';
import path from 'path';

const files = await glob('src/**/*.svelte', {
  ignore: ['**/node_modules/**', '**/.svelte-kit/**']
});

const fixes = {
  eventHandlers: 0,
  restProps: 0,
  reactiveLabels: 0,
  components: 0
};

const log = [];

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const before = src;
  let changed = false;

  // 1️⃣ Fix event handlers: on:click → onclick (most common warning)
  const eventPattern = /\son:(click|input|change|submit|focus|blur|keydown|keyup|keypress|mouseenter|mouseleave|mousedown|mouseup)=/g;
  if (eventPattern.test(src)) {
    src = src.replace(eventPattern, (match, event) => ` on${event}=`);
    fixes.eventHandlers++;
    changed = true;
  }

  // 2️⃣ Fix $$restProps → ...rest (if found outside <script>)
  if (src.includes('$$restProps') && !src.includes('...rest')) {
    src = src.replace(/\{\.\.\.?\$\$restProps\}/g, '{...rest}');
    fixes.restProps++;
    changed = true;
  }

  // 3️⃣ Fix $: reactive labels in script (common warning source)
  const scriptMatch = src.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    const script = scriptMatch[1];
    if (script.includes('$:') && !script.includes('$derived')) {
      // Only fix simple reactive declarations
      let fixedScript = script.replace(
        /\$:\s+(\w+)\s*=\s*([^;]+);/g,
        'const $1 = $derived($2);'
      );
      if (fixedScript !== script) {
        src = src.replace(scriptMatch[0], `<script${scriptMatch[0].match(/<script([^>]*)>/)[1]}>\n${fixedScript}\n</script>`);
        fixes.reactiveLabels++;
        changed = true;
      }
    }
  }

  // 4️⃣ Fix svelte:component (less common but causes warnings)
  if (src.includes('<svelte:component')) {
    log.push(`⚠️  Manual review needed (svelte:component): ${file}`);
  }

  if (changed) {
    fs.writeFileSync(file, src);
    log.push(`✅ Fixed: ${file}`);
  }
}

console.log('\n🎯 Svelte 5 Warning Fixes Complete\n');
console.log(`Event handlers (on:* → on*):     ${fixes.eventHandlers} files`);
console.log(`Rest props ($$restProps → rest): ${fixes.restProps} files`);
console.log(`Reactive labels ($: → $derived): ${fixes.reactiveLabels} files`);
console.log(`\nTotal files modified: ${log.filter(l => l.startsWith('✅')).length}`);

if (log.length > 0) {
  const logFile = `svelte5-warning-fixes-${Date.now()}.log`;
  fs.writeFileSync(logFile, log.join('\n'));
  console.log(`\n📝 Log: ${logFile}`);
}
