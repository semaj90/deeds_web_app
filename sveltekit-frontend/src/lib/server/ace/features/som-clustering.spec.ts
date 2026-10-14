import { describe, expect, it } from 'vitest';
import { SomClusterer } from './som-clustering.js';

describe('SomClusterer materialization boundary', () => {
  it('blocks Postgres writes until revision-qualified admission and readback exist', async () => {
    const clusterer = new SomClusterer();

    await expect(clusterer.materializeToPostgres({
      assignments: [],
      centroids: [],
      iteration: 0,
      convergence: 0,
      version: 'fixture',
      timestamp: 0,
      totalProcessed: 0,
      totalSuccessful: 0,
      totalFailed: 0,
    })).rejects.toThrow('SOM_MATERIALIZATION_BLOCKED');
  });
});
