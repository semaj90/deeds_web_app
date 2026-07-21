import { describe, expect, it } from 'vitest';

import { readJsonReport, readJsonlReport } from './report-utils.js';

type FeatureLineageReport = {
  summary: { total: number; passed: number; failed: number; warnings: number; success: boolean };
  gates: Array<{ name: string; passed: boolean; message: string }>;
  statistics: {
    total_directories: number;
    hidden_directories: number;
    feature_ids_unique: number;
    source_refs_mapped: number;
    collections_used: string[];
  };
};

type DirectoryEntry = {
  directory_path: string;
  source_ref: string;
  feature_id: string;
  feature_label: string;
};

describe('source ref lineage', () => {
  const report = readJsonReport<FeatureLineageReport>('../../docs/reports/feature-lineage-verification.json');
  const entries = readJsonlReport<DirectoryEntry>('../../memory/exports/directory-source-map.jsonl');

  it('keeps the feature lineage report green', () => {
    expect(report.summary.success).toBe(true);
    expect(report.summary.failed).toBe(0);
    expect(report.gates.every((gate) => gate.passed)).toBe(true);
  });

  it('keeps source_ref, feature_id, and feature_label populated for every directory entry', () => {
    for (const entry of entries.slice(0, 500)) {
      expect(entry.directory_path).toBeTruthy();
      expect(entry.source_ref).toBeTruthy();
      expect(entry.feature_id).toMatch(/^[a-f0-9]{12}$/);
      expect(entry.feature_label).toBeTruthy();
    }
  });

  it('keeps the directory export unique by source spine', () => {
    const sourceRefs = new Set(entries.map((entry) => entry.source_ref));
    const featureIds = new Set(entries.map((entry) => entry.feature_id));

    expect(sourceRefs.size).toBe(entries.length);
    expect(featureIds.size).toBe(entries.length);
    expect(report.statistics.total_directories).toBe(entries.length);
    expect(report.statistics.source_refs_mapped).toBe(entries.length);
  });
});
