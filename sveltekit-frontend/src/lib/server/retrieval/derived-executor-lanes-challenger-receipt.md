# Derived Executor Lanes — Challenger-Only Role Receipt

## Identity
- **Change**: parent-atlas-retrieval-executor-compatibility-convergence
- **Task**: 11.3
- **Source Ref**: sveltekit-frontend
- **Feature ID**: derived-executor-lanes
- **Feature Label**: Derived executor lanes (Python worker, LangGraph synthesis)
- **Packet Key**: derived-executor-lanes-challenger-v1
- **Revision**: derived-executor-lanes-challenger-receipt-v1

## Challenger-Only Role Statement

The derived executor lanes (Python worker receipt, LangGraph synthesis) operate as **challenger-only** roles. They do not hold canonical authority for the ACE retrieval pipeline.

### Challenger-Only Responsibilities
- **Python worker**: Runs as a challenger runtime that produces diagnostic receipts. It does not own canonical data structures or execute canonical write-order mutations.
- **LangGraph synthesis**: Operates as a challenger synthesis service. It consumes evidence and produces candidate responses, but does not modify canonical Postgres state.

### Challenger Constraints
- **No canonical writes**: Derived executor lanes never perform canonical writes to Postgres, Qdrant, or Redis as authoritative operations.
- **Evidence downgrade**: All results from derived executor lanes are explicitly downgraded to diagnostic status.
- **Refusal to claim authority**: Derived executor lanes refuse to claim canonical authority over existing modules, tables, or reports.

### Challenger Evidence
- The derived executor lanes produce read-only diagnostics and challenger-only role receipts.
- They do not bypass the :8090 owner or the ACE retrieval order.

## Validation

### Test: derived-executor-lanes-challenger-receipt.spec.ts
This test verifies the challenger-only role receipt.

```typescript
import { describe, expect, it } from 'vitest';
import { readDerivedExecutorLanesChallengerReceipt } from './derived-executor-lanes-challenger-receipt.js';

describe('derived executor lanes challenger role receipt', () => {
  it('asserts challenger-only role and no canonical authority', () => {
    const receipt = readDerivedExecutorLanesChallengerReceipt({
      featureId: 'derived-executor-lanes',
      sourceRef: 'sveltekit-frontend',
      packetKey: 'derived-executor-lanes-challenger-v1',
    });

    expect(receipt.challengerOnly).toBe(true);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.canonicalWrites).toBe(false);
    expect(receipt.diagnosticStatus).toBe(true);
  });
});
```

### Expected Results
- **challengerOnly**: true
- **canonicalAuthority**: false
- **canonicalWrites**: false
- **diagnosticStatus**: true

## Notes

The derived executor lanes operate strictly as challenger-only roles. They do not hold canonical authority and never perform canonical writes. Their results are explicitly downgraded to diagnostic status.

## Open Gates

The following gates remain open and are not claimed by this receipt:
- No challenger-only role receipt for the derived executor lanes (task 11.3)
- No explicit ACE/PromptPlan adapter receipt for the diagnostic coordinator (task 9.4)
- No lineage reconstruction gate (task 11.5) — PostgreSQL source_revision unavailable
- No lexical/AST replay gate (task 11.6) — provider invocation unavailable or bounded out
- No pgvector filtered-HNSW revision gate (task 11.7) — revision filtering not applied
- No TensorRT-RTX promotion gate (task 11.8) — challenger-only
- No model-checksum gate (task 11.9) — llama-server :8090 checksum missing
- No :8080 discrimination gate (task 11.10) — :8080/health returns 400, remains different service
- No live canonical mutation gate (task 11.11) — live writes remain disabled

## References

- [ACE Protocol](https://ace-protocol.readthedocs.io/)
- [Parent Atlas Retrieval Executor Compatibility Convergence](openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence/proposal.md)
- [ACE PromptPlan File Compiler](openspec/changes/ace-promptplan-file-compiler/proposal.md)