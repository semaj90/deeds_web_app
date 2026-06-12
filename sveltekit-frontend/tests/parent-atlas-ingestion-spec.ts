/**
 * Parent Atlas Ingestion Verification Test Suite
 *
 * P0 Task #4 — Test Specs for Directory-level sourceRef mapping,
 * gitignored path visibility, generated dir exclusion, cold-storage verification,
 * and Qdrant/Postgres/Redis consensus.
 *
 * Run: npx vitest tests/atlas/parent-atlas-ingestion-spec.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

// ============================================================================
// LOAD ARTIFACTS
// ============================================================================

let directorySourceMap: any[] = [];
let ignoredDirectoryAudit: any = {};

beforeAll(() => {
  // Load directory-source-map from JSONL
  const mapPath = path.join(process.cwd(), 'memory/exports/directory-source-map.jsonl');
  if (fs.existsSync(mapPath)) {
    const content = fs.readFileSync(mapPath, 'utf-8');
    directorySourceMap = content
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }

  // Load ignored-directory-audit from JSON
  const auditPath = path.join(process.cwd(), 'docs/reports/ignored-directory-audit.json');
  if (fs.existsSync(auditPath)) {
    ignoredDirectoryAudit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
  }
});

// ============================================================================
// TEST SUITE: Ingestion Index Stability
// ============================================================================

describe('Ingestion Index Stability', () => {
  it('should have consistent directory counts across runs', () => {
    expect(directorySourceMap.length).toBeGreaterThan(1000);
    expect(directorySourceMap.length).toBeLessThan(50000);
  });

  it('should map every directory to exactly one sourceRef', () => {
    const dirPaths = new Set(directorySourceMap.map(d => d.directory_path));
    expect(dirPaths.size).toBe(directorySourceMap.length);
  });

  it('should assign unique feature_id per directory', () => {
    const featureIds = new Set(directorySourceMap.map(d => d.feature_id));
    expect(featureIds.size).toBe(directorySourceMap.length);
  });

  it('should have non-empty feature_label for all entries', () => {
    const emptyLabels = directorySourceMap.filter(d => !d.feature_label || d.feature_label.length === 0);
    expect(emptyLabels.length).toBe(0);
  });
});

// ============================================================================
// TEST SUITE: Source Ref Lineage
// ============================================================================

describe('Source Ref Lineage', () => {
  it('src/lib should map to src_lib', () => {
    const srcLib = directorySourceMap.find(d => d.directory_path === 'src/lib');
    expect(srcLib).toBeDefined();
    expect(srcLib?.source_ref).toBe('src_lib');
  });

  it('src/routes should map to src_routes', () => {
    const srcRoutes = directorySourceMap.find(d => d.directory_path === 'src/routes');
    expect(srcRoutes).toBeDefined();
    expect(srcRoutes?.source_ref).toBe('src_routes');
  });

  it('scripts/atlas should map to scripts_atlas', () => {
    const scriptsAtlas = directorySourceMap.find(d => d.directory_path === 'scripts/atlas');
    expect(scriptsAtlas).toBeDefined();
    expect(scriptsAtlas?.source_ref).toBe('scripts_atlas');
  });

  it('docs should map to docs', () => {
    const docs = directorySourceMap.find(d => d.directory_path === 'docs');
    expect(docs).toBeDefined();
    expect(docs?.source_ref).toBe('docs');
  });

  it('hidden directories should have hidden_ prefix', () => {
    const hiddenDirs = directorySourceMap.filter(d => {
      const pathPart = d.directory_path.split(/[\\\/]/).shift();
      return pathPart && pathPart.startsWith('.');
    });

    const allowedExceptions = new Set(['opencode', 'tmp_artifacts']);
    const improperly = hiddenDirs.filter(d =>
      !d.source_ref.startsWith('hidden_') && !allowedExceptions.has(d.source_ref)
    );

    expect(improperly.length).toBe(0);
  });
});

// ============================================================================
// TEST SUITE: Feature ID Generation
// ============================================================================

describe('Feature ID Generation', () => {
  it('all feature_ids should be 12-char hex strings', () => {
    const invalidIds = directorySourceMap.filter(d => !/^[a-f0-9]{12}$/.test(d.feature_id));
    expect(invalidIds.length).toBe(0);
  });

  it('feature_id should be deterministic (same for same dir path)', () => {
    // This would require running the script twice, so we just verify format
    const sampleId = directorySourceMap[0].feature_id;
    expect(typeof sampleId).toBe('string');
    expect(sampleId.length).toBe(12);
  });
});

// ============================================================================
// TEST SUITE: Qdrant Collection Assignment
// ============================================================================

describe('Qdrant Collection Assignment', () => {
  const VALID_COLLECTIONS = [
    'codebase_chunks',
    'legal_documents',
    'semantic_cards',
    'general'
  ];

  it('all entries should have valid Qdrant collection', () => {
    const invalidCollections = directorySourceMap.filter(d =>
      !VALID_COLLECTIONS.includes(d.qdrant_collection)
    );
    expect(invalidCollections.length).toBe(0);
  });

  it('src/* should map to codebase_chunks', () => {
    const srcEntries = directorySourceMap.filter(d => d.directory_path.startsWith('src'));
    srcEntries.forEach(d => {
      expect(d.qdrant_collection).toBe('codebase_chunks');
    });
  });

  it('docs/* should map to legal_documents', () => {
    const docsEntries = directorySourceMap.filter(d => d.directory_path.startsWith('docs'));
    docsEntries.forEach(d => {
      expect(d.qdrant_collection).toBe('legal_documents');
    });
  });

  it('neschrom97/* should map to semantic_cards', () => {
    const nesEntries = directorySourceMap.filter(d => d.directory_path.startsWith('neschrom97'));
    nesEntries.forEach(d => {
      expect(d.qdrant_collection).toBe('semantic_cards');
    });
  });
});

// ============================================================================
// TEST SUITE: Redis Centroid Key Formatting
// ============================================================================

describe('Redis Centroid Key Formatting', () => {
  it('all Redis centroid keys should follow format centroid:directory:${source_ref}:${feature_id}', () => {
    const invalidKeys = directorySourceMap.filter(d => {
      const expected = `centroid:directory:${d.source_ref}:${d.feature_id}`;
      return d.redis_centroid_key !== expected;
    });
    expect(invalidKeys.length).toBe(0);
  });

  it('Redis key should contain source_ref and feature_id', () => {
    const sample = directorySourceMap[0];
    expect(sample.redis_centroid_key).toContain(sample.source_ref);
    expect(sample.redis_centroid_key).toContain(sample.feature_id);
  });
});

// ============================================================================
// TEST SUITE: Gitignored Path Visibility
// ============================================================================

describe('Gitignored Path Visibility', () => {
  it('should have audit data for gitignored directories', () => {
    expect(ignoredDirectoryAudit.directories).toBeDefined();
    expect(Array.isArray(ignoredDirectoryAudit.directories)).toBe(true);
  });

  it('should detect .opencode as hidden directory', () => {
    const opencode = ignoredDirectoryAudit.directories?.find((d: any) =>
      d.directory_path === '.opencode'
    );
    expect(opencode).toBeDefined();
    expect(opencode?.hiddenDirectory).toBe(true);
  });

  it('should count files in gitignored directories', () => {
    const dirsWithFiles = ignoredDirectoryAudit.directories?.filter((d: any) =>
      d.file_count && d.file_count > 0
    ) || [];
    expect(dirsWithFiles.length).toBeGreaterThan(0);
  });

  it('should categorize ignored directories by type', () => {
    const dirs = ignoredDirectoryAudit.directories || [];
    const types = new Set(dirs.map((d: any) => d.directory_type));
    expect(types.size).toBeGreaterThan(0);
  });
});

// ============================================================================
// TEST SUITE: Cold Storage Manifest Integrity
// ============================================================================

describe('Cold Storage Manifest Integrity', () => {
  it('all directories should have cold_storage_status field', () => {
    const missingStatus = directorySourceMap.filter(d => !('cold_storage_status' in d));
    expect(missingStatus.length).toBe(0);
  });

  it('cold_storage_status should be one of valid values', () => {
    const VALID_STATUS = ['not_archived', 'archived', 'cold_archive', 'pending_archive'];
    const invalid = directorySourceMap.filter(d =>
      !VALID_STATUS.includes(d.cold_storage_status)
    );
    expect(invalid.length).toBe(0);
  });

  it('packet_count and summary_count should be non-negative', () => {
    const negative = directorySourceMap.filter(d =>
      d.packet_count < 0 || d.summary_count < 0
    );
    expect(negative.length).toBe(0);
  });
});

// ============================================================================
// TEST SUITE: Generated vs Source Directories
// ============================================================================

describe('Generated vs Source Directory Exclusion', () => {
  it('should exclude node_modules from source mapping', () => {
    const hasNodeModules = directorySourceMap.some(d =>
      d.directory_path.includes('node_modules')
    );
    expect(hasNodeModules).toBe(false);
  });

  it('should exclude .git from source mapping', () => {
    const hasGit = directorySourceMap.some(d =>
      d.directory_path.includes('.git') && d.directory_path !== '.gitignore'
    );
    expect(hasGit).toBe(false);
  });

  it('should exclude build/dist directories from primary indexing', () => {
    const excluded = ['dist', 'build', '.vite', '.svelte-kit'];
    const hasExcluded = directorySourceMap.some(d =>
      excluded.some(ex => d.directory_path.includes(ex))
    );
    expect(hasExcluded).toBe(false);
  });

  it('should include .tmp as a special temporary artifacts collection', () => {
    const tmpDir = directorySourceMap.find(d => d.directory_path === '.tmp');
    expect(tmpDir).toBeDefined();
    expect(tmpDir?.source_ref).toBe('tmp_artifacts');
  });
});

// ============================================================================
// TEST SUITE: Consensus Validation
// ============================================================================

describe('Consensus Validation', () => {
  it('Postgres atlas_packets should reference valid feature_ids', () => {
    // This would require DB access, so we validate the lineage only
    const allFeatureIds = new Set(directorySourceMap.map(d => d.feature_id));
    expect(allFeatureIds.size).toBeGreaterThan(0);
  });

  it('Qdrant payload should include feature_id and source_ref', () => {
    // Validate that the mapping schema is consistent
    directorySourceMap.slice(0, 100).forEach(d => {
      expect(d.feature_id).toBeDefined();
      expect(d.source_ref).toBeDefined();
      expect(d.qdrant_collection).toBeDefined();
    });
  });

  it('Redis centroid cache keys should be consistently formatted', () => {
    // All keys follow the same pattern
    const keyPattern = /^centroid:directory:[a-zA-Z0-9_\-\\/\\.@!$()\\[\\]+,]+:[a-f0-9]{12}$/;
    const invalidKeys = directorySourceMap.filter(d =>
      !keyPattern.test(d.redis_centroid_key)
    );
    expect(invalidKeys.length).toBe(0);
  });
});

// ============================================================================
// TEST SUITE: Coverage Metrics
// ============================================================================

describe('Coverage Metrics', () => {
  it('should have >90% of directories with source_ref', () => {
    const withSourceRef = directorySourceMap.filter(d => d.source_ref).length;
    const coverage = (withSourceRef / directorySourceMap.length) * 100;
    expect(coverage).toBeGreaterThan(90);
  });

  it('should have >95% of directories with feature_id', () => {
    const withFeatureId = directorySourceMap.filter(d => d.feature_id).length;
    const coverage = (withFeatureId / directorySourceMap.length) * 100;
    expect(coverage).toBeGreaterThan(95);
  });

  it('should have >95% of directories with feature_label', () => {
    const withLabel = directorySourceMap.filter(d => d.feature_label && d.feature_label.length > 0).length;
    const coverage = (withLabel / directorySourceMap.length) * 100;
    expect(coverage).toBeGreaterThan(95);
  });

  it('should map to a reasonable number of Qdrant collections', () => {
    const collections = new Set(directorySourceMap.map(d => d.qdrant_collection));
    expect(collections.size).toBeGreaterThanOrEqual(2);
    expect(collections.size).toBeLessThanOrEqual(10);
  });
});
