import { describe, expect, it } from 'vitest';

describe('drizzle sidecar policy', () => {
  it('separates documented sidecars from undocumented pending SQL', async () => {
    const policy = await import('../../../../../scripts/atlas/drizzle-sidecar-policy.mjs');

    const documented = policy.loadDocumentedSidecars(
      'C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/drizzle/sidecar-migrations.json',
    );
    const sqlFiles = [
      '0013_codeintel_indexes.sql',
      '0013_research_summaries.sql',
      '0016_codeintel_schema.sql',
      '0020_future.sql',
    ];
    const journaled = new Set(['0013_research_summaries']);

    const result = policy.classifyDrizzlePendingSql(sqlFiles, journaled, documented);

    expect(result.documented).toEqual(expect.arrayContaining([
      '0013_codeintel_indexes.sql',
      '0016_codeintel_schema.sql',
    ]));
    expect(result.undocumented).toEqual(expect.arrayContaining([
      '0020_future.sql',
    ]));
    expect(policy.sidecarResolutionAdvice('0013_codeintel_indexes.sql')).toEqual(
      expect.objectContaining({
        severity: 'info',
        status: 'documented_sidecar',
      }),
    );
    expect(policy.undocumentedSqlAdvice('0020_future.sql')).toEqual(
      expect.objectContaining({
        severity: 'medium',
        status: 'stale_migration',
      }),
    );
  });
});
