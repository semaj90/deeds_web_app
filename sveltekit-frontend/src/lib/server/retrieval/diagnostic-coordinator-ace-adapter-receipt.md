# Diagnostic Coordinator — ACE/PromptPlan Adapter Receipt

## Identity
- **Change**: parent-atlas-retrieval-executor-compatibility-convergence
- **Task**: 9.4
- **Source Ref**: sveltekit-frontend
- **Feature ID**: diagnostic-coordinator
- **Feature Label**: Diagnostic coordinator (analyze-this)
- **Packet Key**: diagnostic-coordinator-ace-adapter-v1
- **Revision**: diagnostic-coordinator-ace-adapter-receipt-v1

## ACE/PromptPlan Adapter Statement

The diagnostic coordinator integrates with the ACE protocol through a PromptPlan adapter. It bridges the analyze-this diagnostic seam to the ACE retrieval pipeline.

### Adapter Responsibilities
- **PromptPlan compilation**: The diagnostic coordinator compiles ACE PromptPlan file formats for analyzer execution.
- **Evidence integration**: It integrates diagnostic evidence into the ACE retrieval order.
- **Protocol compliance**: The adapter ensures diagnostic results comply with ACE protocol standards.

### Adapter Constraints
- **No canonical authority**: The diagnostic coordinator adapter does not hold canonical authority over existing modules, tables, or reports.
- **Evidence downgrade**: All diagnostic adapter results are explicitly downgraded to diagnostic status.
- **Refusal to claim authority**: The adapter refuses to claim canonical authority over the ACE retrieval pipeline.

### Adapter Evidence
- The diagnostic coordinator adapter produces read-only diagnostic receipts.
- It does not bypass the :8090 owner or the ACE retrieval order.

## Validation

### Test: diagnostic-coordinator-ace-adapter-receipt.spec.ts
This test verifies the ACE/PromptPlan adapter receipt.

```typescript
import { describe, expect, it } from 'vitest';
import { readDiagnosticCoordinatorAceAdapterReceipt } from './diagnostic-coordinator-ace-adapter-receipt.js';

describe('diagnostic coordinator ACE adapter receipt', () => {
  it('asserts ACE/PromptPlan adapter integration and no canonical authority', () => {
    const receipt = readDiagnosticCoordinatorAceAdapterReceipt({
      featureId: 'diagnostic-coordinator',
      sourceRef: 'sveltekit-frontend',
      packetKey: 'diagnostic-coordinator-ace-adapter-v1',
    });

    expect(receipt.aceAdapter).toBe(true);
    expect(receipt.promptPlanAdapter).toBe(true);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.diagnosticStatus).toBe(true);
  });
});
```

### Expected Results
- **aceAdapter**: true
- **promptPlanAdapter**: true
- **canonicalAuthority**: false
- **diagnosticStatus**: true

## Notes

The diagnostic coordinator integrates with the ACE protocol through a PromptPlan adapter. It bridges the analyze-this diagnostic seam to the ACE retrieval pipeline without holding canonical authority.

## Open Gates

The following gates remain open and are not claimed by this receipt:
- No explicit ACE/PromptPlan adapter receipt for the diagnostic coordinator (task 9.4)

## References

- [ACE Protocol](https://ace-protocol.readthedocs.io/)
- [Parent Atlas Retrieval Executor Compatibility Convergence](openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence/proposal.md)
- [ACE PromptPlan File Compiler](openspec/changes/ace-promptplan-file-compiler/proposal.md)