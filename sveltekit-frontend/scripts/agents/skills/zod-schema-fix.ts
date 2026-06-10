/**
 * skills/zod-schema-fix.ts
 *
 * Repair skill: Zod schema mismatches.
 * Handles: missing .optional(), wrong enum values, unexpected field errors.
 */
import fs from 'node:fs';
import type { AgentRepairSkill, RepairInput, RepairOutput } from '../repair-registry.ts';

const skill: AgentRepairSkill = {
  id:         'zod-schema-fix',
  feature_id: 'feat:validation:zod-schema-repair',
  source_ref: 'scripts/agents/skills/zod-schema-fix.ts',
  capability: 'zod-fix',
  risk:       'low',

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

    // Detect: field marked required but expected optional from error
    const missingOptionalMatch = error.match(/Required at "([^"]+)"/);
    if (missingOptionalMatch) {
      const fieldPath = missingOptionalMatch[1].split('.').pop() ?? '';
      if (fieldPath) {
        const fieldPattern = new RegExp(`(${fieldPath}:\\s*z\\.\\w+\\([^)]*\\))(?!\\.optional)`, 'g');
        const replaced = patched.replace(fieldPattern, (_match, field) => {
          notes.push(`Made field '${fieldPath}' optional`);
          changes++;
          return `${field}.optional()`;
        });
        patched = replaced;
      }
    }

    // Detect: invalid_enum_value — extract enum + received value
    const enumMatch = error.match(/invalid_enum_value.*received "([^"]+)".*options: \[([^\]]+)\]/);
    if (enumMatch) {
      notes.push(`Enum mismatch: received "${enumMatch[1]}", valid: [${enumMatch[2]}]`);
      notes.push('Manual enum value correction required — check input source');
    }

    // Detect: z.string() where z.coerce.string() needed (from numeric query params)
    if (/Expected string, received number/.test(error)) {
      patched = patched.replace(/z\.string\(\)/g, (match) => {
        notes.push('Replaced z.string() with z.coerce.string() for numeric coercion');
        changes++;
        return 'z.coerce.string()';
      });
    }

    if (changes === 0 && !enumMatch) {
      notes.push('Could not auto-fix — ZodError needs manual schema inspection');
      return { confidence: 0.3, notes, files: [] };
    }

    const patch = patched !== original ? buildUnifiedDiff(source_ref, original, patched) : undefined;
    if (patched !== original) files.push(source_ref);

    if (!dryRun && patched !== original) {
      fs.writeFileSync(source_ref, patched, 'utf8');
      notes.push(`Applied ${changes} Zod schema fixes to ${source_ref}`);
    } else if (patched !== original) {
      notes.push(`[dry-run] Would apply ${changes} Zod schema fixes`);
    }

    return {
      patch,
      files,
      confidence: changes > 0 ? 0.70 : 0.35,
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
