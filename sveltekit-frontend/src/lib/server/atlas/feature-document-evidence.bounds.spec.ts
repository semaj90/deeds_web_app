import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectFeatureDirectoryArtifacts,
  readFeatureDocumentManifestFile,
} from './feature-document-evidence.js';

const tempDirectories: string[] = [];

function makeTempDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-feature-doc-bounds-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('feature-document evidence read bounds', () => {
  it('rejects a manifest above the caller-provided byte budget before parsing it', () => {
    const directory = makeTempDirectory();
    const manifestPath = path.join(directory, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ featureId: 'fixture', padding: 'x'.repeat(128) }));

    expect(() => readFeatureDocumentManifestFile(manifestPath, 32)).toThrow('FEATURE_DOCUMENT_MANIFEST_TOO_LARGE');
    expect(readFeatureDocumentManifestFile(manifestPath).manifest.featureId).toBe('fixture');
  });

  it('stops directory enumeration at the configured entry budget and marks the inventory incomplete', () => {
    const directory = makeTempDirectory();
    for (const name of ['a.md', 'b.md', 'c.md', 'ignored.bin']) {
      fs.writeFileSync(path.join(directory, name), 'fixture');
    }

    const result = collectFeatureDirectoryArtifacts(directory, 2);
    expect(result.artifacts).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(() => collectFeatureDirectoryArtifacts(directory, 10_001)).toThrow(RangeError);
  });

  it('returns a complete bounded inventory when all entries fit under the cap', () => {
    const directory = makeTempDirectory();
    fs.writeFileSync(path.join(directory, 'a.md'), 'fixture');

    const result = collectFeatureDirectoryArtifacts(directory, 2);
    expect(result.artifacts).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });
});
