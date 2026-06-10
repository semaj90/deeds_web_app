/**
 * skills/type-import-fix.ts
 *
 * Repair skill: TypeScript import errors.
 * Handles:
 *   - import { A: B } corruption → import { A, B }
 *   - Missing .js extensions on relative imports
 *   - ioredis type augmentation (declare module 'ioredis' shadows bundled types)
 *   - rune calls ($state/$derived) in plain .ts files
 */
import fs from 'node:fs';
import type { AgentRepairSkill, RepairInput, RepairOutput } from '../repair-registry.ts';

const skill: AgentRepairSkill = {
  id:         'type-import-fix',
  feature_id: 'feat:typescript:import-repair',
  source_ref: 'scripts/agents/skills/type-import-fix.ts',
  capability: 'type-fix',
  risk:       'low',

  async run(input: RepairInput): Promise<RepairOutput> {
    const { source_ref, dryRun } = input;
    const notes: string[] = [];
    const files: string[] = [];

    if (!fs.existsSync(source_ref)) {
      return { confidence: 0, notes: [`File not found: ${source_ref}`] };
    }

    const original = fs.readFileSync(source_ref, 'utf8');
    let patched = original;
    let changes = 0;

    // Pattern 1: import { A: B } corruption → import { A, B }
    // Matches: import { TypeA: TypeB } or import { A: B, C: D }
    patched = patched.replace(
      /import\s+(type\s+)?\{([^}]+)\}/g,
      (match, typeKw = '', body) => {
        if (!/:/.test(body)) return match;
        const fixed = body.replace(/(\w+)\s*:\s*(\w+)/g, (_m: string, a: string, b: string) => {
          // Only fix if looks like corruption (both are PascalCase or same word)
          // Real { key: value } in imports is destructuring — don't touch
          if (a === b || (a[0] === a[0].toUpperCase() && b[0] === b[0].toUpperCase())) {
            notes.push(`Fixed import { ${a}: ${b} } → { ${a}, ${b} }`);
            changes++;
            return `${a}, ${b}`;
          }
          return _m;
        });
        return `import ${typeKw}{${fixed}}`;
      }
    );

    // Pattern 2: relative imports missing .js extension
    // Only for .ts files (not .svelte)
    if (source_ref.endsWith('.ts') && !source_ref.endsWith('.d.ts')) {
      patched = patched.replace(
        /from\s+['"](\.[^'"]+)['"]/g,
        (match, importPath) => {
          // Skip if already has extension or is a directory index
          if (/\.(js|ts|svelte|json|css)$/.test(importPath)) return match;
          if (importPath.endsWith('/')) return match;
          notes.push(`Added .js extension to relative import: ${importPath}`);
          changes++;
          return match.replace(importPath, `${importPath}.js`);
        }
      );
    }

    // Pattern 3: declare module 'ioredis' augmentation — flag only
    if (/declare\s+module\s+['"]ioredis['"]/.test(patched)) {
      notes.push("Found 'declare module ioredis' augmentation — this shadows bundled ioredis types. Remove it.");
      changes++;
    }

    // Pattern 4: rune calls in plain .ts (not .svelte.ts)
    if (source_ref.endsWith('.ts') && !source_ref.endsWith('.svelte.ts')) {
      const runeUsages = patched.match(/\$(?:state|derived|effect|props)\s*[(<]/g) ?? [];
      if (runeUsages.length > 0) {
        notes.push(`Found ${runeUsages.length} rune calls ($state/$derived/$effect) in plain .ts file — move to .svelte.ts`);
        changes += runeUsages.length;
      }
    }

    if (changes === 0) {
      notes.push('No auto-fixable import issues found');
      return { confidence: 0.3, notes, files: [] };
    }

    const patch = patched !== original ? buildUnifiedDiff(source_ref, original, patched) : undefined;
    if (patched !== original) files.push(source_ref);

    if (!dryRun && patched !== original) {
      fs.writeFileSync(source_ref, patched, 'utf8');
      notes.push(`Applied ${changes} import fixes to ${source_ref}`);
    } else if (patched !== original) {
      notes.push(`[dry-run] Would apply ${changes} import fixes`);
    }

    return {
      patch,
      files,
      confidence: 0.75,
      notes,
      checkCommands: ['npm run check'],
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
