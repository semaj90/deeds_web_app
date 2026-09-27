import { describe, expect, it } from 'vitest';
import { compileSemanticInputArtifactV1, renderSemanticInputText } from './semantic-input-compiler-v1.js';
import { SELECTION_POLICY_REVISIONS, semanticInputArtifactV1Schema } from './semantic-input-artifact-v1.js';

const SOURCE_REVISION = 'sha256:' + '0'.repeat(64);

describe('compileSemanticInputArtifactV1', () => {
  it('selects top-level TS declarations, not the whole file', async () => {
    const src = `import { x } from './y';\n\nfunction foo(a: number) { return a + 1; }\n\nconst noise = 'unrelated padding text that should not be selected';\n\nexport class Bar { doThing() { return 1; } }\n`;
    const artifact = await compileSemanticInputArtifactV1({
      canonicalId: 'test:1',
      packetKey: 'ace:packet:test1',
      sourceRef: 'src/example.ts',
      sourceRevision: SOURCE_REVISION,
      fileBuffer: Buffer.from(src, 'utf8'),
    });

    semanticInputArtifactV1Schema.parse(artifact); // throws on any contract violation
    expect(artifact.selectionPolicyRevision).toBe(SELECTION_POLICY_REVISIONS.TS_JS_TOP_LEVEL_DECLARATIONS);
    expect(artifact.segments.length).toBeGreaterThanOrEqual(2); // foo + Bar
    expect(artifact.segments.every((s) => s.kind === 'DECLARATION')).toBe(true);

    const rendered = renderSemanticInputText(artifact, Buffer.from(src, 'utf8'));
    expect(rendered).not.toContain('unrelated padding text');
    expect(rendered).toContain('function foo');
    expect(rendered).toContain('class Bar');
  });

  it('regression: exported functions do not double-count overlapping export+bare pattern matches', async () => {
    // Found live (SEM-INPUT-02 canary, ordinal 51): an `export function`
    // matched both the bare and export-prefixed patterns, and without
    // de-overlapping, renderedBytes exceeded originalBytes -- impossible
    // unless segments overlap, since all segments are subsets of the same
    // buffer. This asserts the invariant that regression cannot recur.
    const src = `export function alpha(a: number) { return a + 1; }\n\nexport class Beta { method() { return 2; } }\n`;
    const buf = Buffer.from(src, 'utf8');
    const artifact = await compileSemanticInputArtifactV1({
      canonicalId: 'test:overlap',
      packetKey: null,
      sourceRef: 'src/overlap.ts',
      sourceRevision: SOURCE_REVISION,
      fileBuffer: buf,
    });
    const totalSegmentBytes = artifact.segments.reduce((sum, s) => sum + (s.endByte - s.startByte), 0);
    expect(totalSegmentBytes).toBeLessThanOrEqual(buf.length);
    // No two segments may overlap.
    const sorted = [...artifact.segments].sort((a, b) => a.startByte - b.startByte);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startByte).toBeGreaterThanOrEqual(sorted[i - 1].endByte);
    }
  });

  it('falls back to WHOLE_FILE_FALLBACK for a TS file with no top-level function/class', async () => {
    const src = `export const A = 1;\nexport const B = 2;\n`;
    const artifact = await compileSemanticInputArtifactV1({
      canonicalId: 'test:2',
      packetKey: null,
      sourceRef: 'src/constants.ts',
      sourceRevision: SOURCE_REVISION,
      fileBuffer: Buffer.from(src, 'utf8'),
    });
    expect(artifact.selectionPolicyRevision).toBe(SELECTION_POLICY_REVISIONS.WHOLE_FILE_FALLBACK_UNSUPPORTED_GRAMMAR);
    expect(artifact.segments).toEqual([{ kind: 'WHOLE_FILE_FALLBACK', startByte: 0, endByte: Buffer.byteLength(src, 'utf8'), checksum: expect.stringMatching(/^sha256:/) }]);
  });

  it('selects the first heading section of a markdown file, not the whole file', async () => {
    const src = `# First Heading\n\nFirst section content.\n\n## Second Heading\n\nSecond section content that should NOT be selected.\n`;
    const artifact = await compileSemanticInputArtifactV1({
      canonicalId: 'test:3',
      packetKey: null,
      sourceRef: 'docs/example.md',
      sourceRevision: SOURCE_REVISION,
      fileBuffer: Buffer.from(src, 'utf8'),
    });
    expect(artifact.selectionPolicyRevision).toBe(SELECTION_POLICY_REVISIONS.MARKDOWN_FIRST_HEADING_SECTION);
    const rendered = renderSemanticInputText(artifact, Buffer.from(src, 'utf8'));
    expect(rendered).toContain('First section content');
    expect(rendered).not.toContain('Second section content');
  });

  it('uses an explicit named fallback for an unsupported grammar (e.g. .sql), never a silent truncation', async () => {
    const src = `SELECT * FROM foo WHERE bar = 1;\n`;
    const artifact = await compileSemanticInputArtifactV1({
      canonicalId: 'test:4',
      packetKey: null,
      sourceRef: 'scripts/query.sql',
      sourceRevision: SOURCE_REVISION,
      fileBuffer: Buffer.from(src, 'utf8'),
    });
    expect(artifact.selectionPolicyRevision).toBe(SELECTION_POLICY_REVISIONS.WHOLE_FILE_FALLBACK_UNSUPPORTED_GRAMMAR);
    expect(artifact.segments[0].kind).toBe('WHOLE_FILE_FALLBACK');
  });

  it('renderedTextChecksum is deterministic and reflects only the selected segments', async () => {
    const src = `function foo() { return 1; }\n\nconst pad = 'x'.repeat(10000);\n`;
    const a1 = await compileSemanticInputArtifactV1({ canonicalId: 'c', packetKey: null, sourceRef: 'a.ts', sourceRevision: SOURCE_REVISION, fileBuffer: Buffer.from(src) });
    const a2 = await compileSemanticInputArtifactV1({ canonicalId: 'c', packetKey: null, sourceRef: 'a.ts', sourceRevision: SOURCE_REVISION, fileBuffer: Buffer.from(src) });
    expect(a1.renderedTextChecksum).toBe(a2.renderedTextChecksum);
    expect(a1.renderedTextChecksum).not.toBe('sha256:' + require('node:crypto').createHash('sha256').update(src).digest('hex'));
  });
});
