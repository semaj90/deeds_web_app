import { describe, expect, it } from 'vitest';
import {
  reconcileSourceLineageAxesV1,
  verifySourceLineageAxesChecksumV1,
} from './source-lineage-axes-v1.js';

const symbol = {
  sourceRef: 'src/a.ts',
  workspaceRevision: 'sha256:' + 'w'.repeat(64),
  repositoryRevision: '1bb240fb20f1d4ba5651d8a4da9a10c9d6337aaf',
};
const binding = {
  sourceRef: 'src/a.ts',
  workspaceRevision: symbol.workspaceRevision,
  sourceRevision: 'sha256:' + 'a'.repeat(64),
};

describe('source lineage axes v1', () => {
  it('matches exact content lineage without collapsing repository lineage', () => {
    const result = reconcileSourceLineageAxesV1(symbol, binding);
    expect(result.status).toBe('MATCHED');
    expect(result.repositoryRevision).toBe(symbol.repositoryRevision);
    expect(result.sourceContentRevision).toBe(binding.sourceRevision);
    expect(result.repositoryRevision).not.toBe(result.sourceContentRevision);
    expect(verifySourceLineageAxesChecksumV1(result)).toBe(true);
  });

  it('classifies source or workspace drift as conflict without rewriting either claim', () => {
    const result = reconcileSourceLineageAxesV1(symbol, {
      ...binding,
      sourceRef: 'src/b.ts',
    });
    expect(result.status).toBe('CONFLICT');
    expect(result.repositoryRevision).toBe(symbol.repositoryRevision);
    expect(result.sourceContentRevision).toBe(binding.sourceRevision);
  });

  it('keeps missing bindings fail-closed', () => {
    const result = reconcileSourceLineageAxesV1(symbol, null);
    expect(result.status).toBe('MISSING_BINDING');
    expect(result.canonicalAuthority).toBe(false);
  });
});
