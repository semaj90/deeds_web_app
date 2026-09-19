import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('derived executor lanes challenger role receipt', () => {
  it('asserts challenger-only role and no canonical authority', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', 'derived-executor-lanes-challenger-receipt.md'),
      'utf-8'
    );

    expect(content).toContain('parent-atlas-retrieval-executor-compatibility-convergence');
    expect(content).toContain('- **Task**: 11.3');
    expect(content).toContain('- **Source Ref**: sveltekit-frontend');
    expect(content).toContain('challenger-only role');
    expect(content).toContain('refuse to claim canonical authority');
    expect(content).toContain(':8090 owner');
    expect(content).toContain('canonical write-order');
    expect(content).toContain('live canonical mutation');
  });
});