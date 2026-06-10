/**
 * skills/route-fix.ts
 *
 * Repair skill: SvelteKit route handler issues.
 * Handles:
 *   - Missing auth guard (locals.user check)
 *   - GET handler returning error-only shape (degraded response contract violation)
 *   - Missing RequestHandler type annotation
 *   - throw error() inside try/catch (caught → 500)
 */
import fs from 'node:fs';
import type { AgentRepairSkill, RepairInput, RepairOutput } from '../repair-registry.ts';

const skill: AgentRepairSkill = {
  id:         'route-fix',
  feature_id: 'feat:sveltekit:route-repair',
  source_ref: 'scripts/agents/skills/route-fix.ts',
  capability: 'route-fix',
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

    const isServerTs = source_ref.endsWith('+server.ts');
    const isPageServer = source_ref.endsWith('+page.server.ts');

    // Pattern 1: GET handler missing auth guard
    if (isServerTs && /export\s+async\s+function\s+GET/.test(patched)) {
      const hasAuthGuard = /locals\.user|requireAuth|getSession/.test(patched);
      if (!hasAuthGuard) {
        notes.push('GET handler missing auth guard (locals.user check) — add if route is protected');
        // Only annotate, don't auto-insert (too risky — some routes are intentionally public)
      }
    }

    // Pattern 2: throw error() inside try/catch — error is caught and becomes 500
    // Fix: move throw error() outside of try block
    const throwInCatchPattern = /try\s*\{[^}]*throw\s+error\(\d+[^}]*\}\s*catch/gs;
    if (throwInCatchPattern.test(patched)) {
      notes.push('Found throw error() inside try block — this is caught and becomes 500. Move not-found checks outside try{}');
      changes++;
    }

    // Pattern 3: GET returning error-only shape (degraded response contract violation)
    // return json({ error: '...' }, { status: 500 }) in a GET handler
    const errorOnlyReturn = /return\s+json\s*\(\s*\{\s*error\s*:/;
    if (isServerTs && /export\s+async\s+function\s+GET/.test(patched) && errorOnlyReturn.test(patched)) {
      notes.push('GET handler returns error-only shape — violates degraded response contract. Return empty-but-valid data instead');
      changes++;
    }

    // Pattern 4: Missing import type { RequestHandler }
    if (isServerTs && !/import\s+type.*RequestHandler/.test(patched) && /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)/.test(patched)) {
      const importLine = `import type { RequestHandler } from './$types';\n`;
      if (!patched.includes('$types')) {
        patched = importLine + patched;
        notes.push(`Added 'import type { RequestHandler }' from '$types'`);
        changes++;
      }
    }

    if (changes === 0) {
      notes.push('No automatable route issues found — manual review recommended');
      return { confidence: 0.35, notes, files: [] };
    }

    const patch = patched !== original ? buildUnifiedDiff(source_ref, original, patched) : undefined;
    if (patched !== original) files.push(source_ref);

    if (!dryRun && patched !== original) {
      fs.writeFileSync(source_ref, patched, 'utf8');
      notes.push(`Applied ${changes} route fixes to ${source_ref}`);
    } else if (patched !== original) {
      notes.push(`[dry-run] Would apply ${changes} route fixes`);
    }

    return {
      patch,
      files,
      confidence: 0.65,
      notes,
      checkCommands: ['npm run check', `npm run test:routes -- ${source_ref.split('/').pop()?.replace(/\+server\.ts$/, '')}`],
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
