# Kv Cache Adaptation Research

## ADDED Requirements

### Requirement: Ornith cache research does not create canonical model memory

Attention KV, recurrent/SSM state and server prefix caches MUST remain runtime
execution state. Atlas MUST NOT persist hidden state as knowledge or implement
arbitrary recurrent-state export/restore under this tranche.

#### Scenario: Exact prefix reuse is measured
- **WHEN** the server is given a prefix bound to model, template, tools, system prompt,
  manifest identity and rendered-prefix checksum
- **THEN** the receipt distinguishes eligibility from observed reuse and records no hidden state

#### Scenario: Prefix identity changes
- **WHEN** a bound revision or rendered prefix changes
- **THEN** the previous Atlas reuse descriptor is ineligible


### Requirement: Kv Cache Adaptation Research stays evidence-bound and non-destructive
The system MUST keep kv cache adaptation research actions identity-qualified, non-destructive, and traceable to real evidence rather than assumed or fabricated state.

#### Scenario: An action under this proposal is planned or executed
- **WHEN** a component covered by this proposal runs
- **THEN** it records real evidence (source, revision, or receipt) for what it did, and never silently promotes unproven state to canonical/production status.

#### Scenario: Evidence is missing or unproven
- **WHEN** the required upstream evidence, gate, or dependency is absent or not yet proven
- **THEN** the component fails closed (skips, blocks, or flags) rather than fabricating a result.
