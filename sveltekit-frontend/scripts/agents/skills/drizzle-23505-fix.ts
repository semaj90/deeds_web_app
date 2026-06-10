/**
 * skills/drizzle-23505-fix.ts
 *
 * Repair skill: Postgres error 23505 (unique_violation).
 * Adds ON CONFLICT DO NOTHING / DO UPDATE guards to INSERT statements
 * in route action files and Drizzle ORM call sites.
 */
import fs from 'node:fs';
import type { AgentRepairSkill, RepairInput, RepairOutput } from '../repair-registry.ts';

const skill: AgentRepairSkill = {
  id:         'drizzle-23505-fix',
  feature_id: 'feat:db:unique-constraint-repair',
  source_ref: 'scripts/agents/skills/drizzle-23505-fix.ts',
  capability: 'drizzle-fix',
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

    // Pattern: .values(...) without .onConflictDoNothing() or .onConflictDoUpdate()
    // Simple heuristic: .insert(...).values(...) NOT followed by .onConflict
    const insertPattern = /\.insert\([^)]+\)\s*\.\s*values\([^)]+\)(?!\s*\.\s*onConflict)/g;
    const insertMatches = [...original.matchAll(insertPattern)];

    if (insertMatches.length > 0) {
      // Append .onConflictDoNothing() to each bare insert
      patched = patched.replace(
        /(\.(insert|values)\([^)]+\))(\s*;)/g,
        (match, insertPart, _method, semi) => {
          notes.push(`Added .onConflictDoNothing() to bare .insert().values() call`);
          changes++;
          return `${insertPart}\n    .onConflictDoNothing()${semi}`;
        }
      );
    }

    // Pattern: Drizzle db.insert without try/catch around it
    const hasErrorBoundary = /try\s*\{[\s\S]*?db\.insert/.test(original);
    if (!hasErrorBoundary && insertMatches.length > 0) {
      notes.push('WARNING: db.insert not wrapped in try/catch — consider adding error boundary');
    }

    // Extract constraint name from error if available
    const constraintMatch = error.match(/constraint[:\s]+"?([a-z_]+)"?/i);
    if (constraintMatch) {
      notes.push(`Detected constraint: ${constraintMatch[1]} — consider .onConflictDoUpdate() with specific target`);
    }

    if (changes === 0) {
      notes.push('No bare Drizzle inserts found — check if error originates from raw SQL or nested function');
      return { confidence: 0.4, notes, files: [] };
    }

    const patch = buildUnifiedDiff(source_ref, original, patched);
    files.push(source_ref);

    if (!dryRun) {
      fs.writeFileSync(source_ref, patched, 'utf8');
      notes.push(`Applied ${changes} conflict guards to ${source_ref}`);
    } else {
      notes.push(`[dry-run] Would add ${changes} .onConflictDoNothing() calls`);
    }

    return {
      patch,
      files,
      confidence: 0.80,
      notes,
      checkCommands: ['npm run check', 'npx drizzle-kit check'],
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
