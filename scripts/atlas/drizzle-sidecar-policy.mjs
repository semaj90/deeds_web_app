import { existsSync, readFileSync } from 'node:fs';

export function loadDocumentedSidecars(manifestPath) {
  if (!existsSync(manifestPath)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return new Set((raw.sidecars ?? []).map((entry) => String(entry?.file ?? '')).filter(Boolean));
  } catch {
    return new Set();
  }
}

export function classifyDrizzlePendingSql(sqlFiles, journaledTags, documentedSidecars) {
  const pending = sqlFiles.filter((file) => !journaledTags.has(file.replace(/\.sql$/, '')));
  const documented = pending.filter((file) => documentedSidecars.has(file));
  const undocumented = pending.filter((file) => !documentedSidecars.has(file));
  return { pending, documented, undocumented };
}

export function sidecarResolutionAdvice(fileName) {
  return {
    status: 'documented_sidecar',
    severity: 'info',
    problem: `Documented sidecar "${fileName}" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).`,
    expected: 'Sidecar migrations are applied manually and excluded from the journal by design.',
    suggestedFix: 'No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.',
  };
}

export function undocumentedSqlAdvice(fileName) {
  return {
    status: 'stale_migration',
    severity: 'medium',
    problem: `"${fileName}" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.`,
    expected: 'Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.',
    suggestedFix: `Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/${fileName}) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.`,
  };
}
