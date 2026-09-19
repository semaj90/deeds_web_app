import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('diagnostic coordinator ACE/PromptPlan adapter receipt', () => {
  it('asserts diagnostic coordinator ACE/PromptPlan adapter role', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', 'diagnostic-coordinator-ace-adapter-receipt.md'),
      'utf-8'
    );

    expect(content).toContain('parent-atlas-retrieval-executor-compatibility-convergence');
    expect(content).toContain('- **Task**: 9.4');
    expect(content).toContain('- **Source Ref**: sveltekit-frontend');
    expect(content).toContain('- **Feature ID**: diagnostic-coordinator');
    expect(content).toContain('- **Feature Label**: Diagnostic coordinator (analyze-this)');
    expect(content).toContain('- **Packet Key**: diagnostic-coordinator-ace-adapter-v1');
    expect(content).toContain('- **Revision**: diagnostic-coordinator-ace-adapter-receipt-v1');
    expect(content).toContain('PromptPlan adapter');
    expect(content).toContain('analyze-this diagnostic seam');
  });
});