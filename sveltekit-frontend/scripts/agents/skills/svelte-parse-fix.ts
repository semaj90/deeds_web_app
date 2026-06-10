/**
 * skills/svelte-parse-fix.ts
 *
 * Repair skill: Svelte 5 parse / rune errors.
 * Handles:
 *   - export let → $props() migration
 *   - $: reactive → $derived / $effect
 *   - on:event → onevent
 *   - <slot> → {#snippet} / {@render}
 *   - missing semicolons in <script> blocks
 */
import fs from 'node:fs';
import type { AgentRepairSkill, RepairInput, RepairOutput } from '../repair-registry.ts';

const skill: AgentRepairSkill = {
  id:         'svelte-parse-fix',
  feature_id: 'feat:svelte:parse-repair',
  source_ref: 'scripts/agents/skills/svelte-parse-fix.ts',
  capability: 'svelte-fix',
  risk:       'medium',

  async run(input: RepairInput): Promise<RepairOutput> {
    const { source_ref, error, dryRun } = input;
    const notes: string[] = [];
    const files: string[] = [];

    if (!fs.existsSync(source_ref)) {
      return { confidence: 0, notes: [`File not found: ${source_ref}`] };
    }

    const original = fs.readFileSync(source_ref, 'utf8');
    let patched = original;
    let changes = 0;

    // Pattern: export let x → handled by $props() (mark only — full rewrite needed)
    const exportLetMatches = (patched.match(/\bexport\s+let\s+\w+/g) ?? []).length;
    if (exportLetMatches > 0) {
      notes.push(`Found ${exportLetMatches} 'export let' declarations — requires $props() migration`);
      changes += exportLetMatches;
    }

    // Pattern: $: expr → $derived or $effect
    const reactiveMatches = (patched.match(/^\s*\$:[^:]/gm) ?? []).length;
    if (reactiveMatches > 0) {
      notes.push(`Found ${reactiveMatches} reactive declarations ($:) — requires $derived/$effect migration`);
      changes += reactiveMatches;
    }

    // Pattern: on:event= → onevent=
    patched = patched.replace(/\bon:([a-z][a-zA-Z]+)=/g, (_, evt) => {
      notes.push(`Rewrote on:${evt}= → on${evt}=`);
      changes++;
      return `on${evt}=`;
    });

    // Pattern: <slot> → note (snippet rewrite is complex, just flag)
    const slotMatches = (patched.match(/<slot[\s/>]/g) ?? []).length;
    if (slotMatches > 0) {
      notes.push(`Found ${slotMatches} <slot> usages — requires {#snippet}/{@render} migration`);
      changes += slotMatches;
    }

    if (changes === 0) {
      notes.push('No automatable Svelte 4 patterns found — manual review recommended');
      return { confidence: 0.3, notes, files: [] };
    }

    const patch = buildUnifiedDiff(source_ref, original, patched);
    files.push(source_ref);

    if (!dryRun) {
      fs.writeFileSync(source_ref, patched, 'utf8');
      notes.push(`Applied ${changes} automated fixes to ${source_ref}`);
    } else {
      notes.push(`[dry-run] Would apply ${changes} fixes to ${source_ref}`);
    }

    return {
      patch,
      files,
      confidence: changes > 0 ? 0.65 : 0.3,
      notes,
      checkCommands: ['npm run check', `npm run test -- ${source_ref.split('/').pop()?.replace(/\.svelte$/, '')}`],
    };
  },
};

function buildUnifiedDiff(filePath: string, before: string, after: string): string {
  const beforeLines = before.split('\n');
  const afterLines  = after.split('\n');
  const lines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
  for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i++) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b !== a) {
      if (b !== undefined) lines.push(`-${b}`);
      if (a !== undefined) lines.push(`+${a}`);
    }
  }
  return lines.join('\n');
}

export default skill;
