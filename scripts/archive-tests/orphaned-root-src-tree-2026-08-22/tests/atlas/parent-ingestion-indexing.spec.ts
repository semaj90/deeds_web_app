import { describe, expect, it } from 'vitest';

import { readJsonlReport } from './report-utils.js';

type DirectoryEntry = {
  directory_path: string;
  source_ref: string;
  feature_id: string;
  feature_label: string;
  qdrant_collection: string;
  redis_centroid_key: string;
};

describe('parent atlas ingestion indexing', () => {
  const entries = readJsonlReport<DirectoryEntry>('../../memory/exports/directory-source-map.jsonl');

  it('keeps directory maps stable and sorted', () => {
    expect(entries.length).toBeGreaterThan(0);

    const sorted = [...entries].sort((a, b) => a.directory_path.localeCompare(b.directory_path));
    expect(entries.map((entry) => entry.directory_path)).toEqual(sorted.map((entry) => entry.directory_path));
  });

  it('keeps gitignored audit surfaces visible while excluding node_modules and .git', () => {
    const hiddenEntries = entries.filter((entry) => entry.directory_path.startsWith('.'));
    expect(hiddenEntries.length).toBeGreaterThan(0);

    expect(entries.some((entry) => entry.directory_path.includes('node_modules'))).toBe(false);
    expect(entries.some((entry) => entry.directory_path.includes('/.git') || entry.directory_path === '.git')).toBe(false);
  });

  it('keeps directory-level lineage fields populated', () => {
    for (const entry of entries.slice(0, 250)) {
      expect(entry.directory_path).toBeTruthy();
      expect(entry.source_ref).toBeTruthy();
      expect(entry.feature_id).toMatch(/^[a-f0-9]{12}$/);
      expect(entry.feature_label).toBeTruthy();
      expect(entry.qdrant_collection).toBeTruthy();
      expect(entry.redis_centroid_key).toContain(`:${entry.source_ref}:${entry.feature_id}`);
    }
  });
});
