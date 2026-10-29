---
type: index
title: Domain Profiles Index
description: Navigation for proposal-only Parent Atlas domain and repository-capability profiles.
resource: .okf/domains/index.md
tags: [okf, domains, taxonomy, proposals]
timestamp: 2026-10-28T00:00:00Z
---

# Domain Profiles

These profiles define bounded, validated classification proposals. They do not own canonical packet identity or authorize `feature_label` writes.

## Profiles

- [Repository capability classification profile](repository-capability-classification.md) — Pydantic-validated tool/function recommendations and evidence policy.
- [Raw YAML profile](repository-capability-classification-v1.yaml) — machine-readable versioned profile consumed by the validator.
- [Atlas domain taxonomy](atlas-domain-taxonomy.yaml) — existing domain taxonomy; retain its current owner and review state.
- [Feature intelligence profile](feature-intelligence.yaml) — existing feature-intelligence contract.
- [Parent Atlas execution profile](parent-atlas-execution.yaml) — existing execution ownership profile.
- [Structured value profile](structured-value.yaml) — existing structured-value contract.

## Relationships

```text
source inventory → Tree-sitter / AST-grep facts → LSP symbol observations
       ↓                                         ↓
dependency manifests → capability proposal ← verified source references
       ↓                    ↓
OpenWiki navigation   BYOG typed-edge context (optional, derived)
                            ↓
                    human review → existing feature-label owner
```

The diagram describes evidence relationships, not a runtime execution graph. Similarity alone never creates an edge, and graph centrality never creates identity or classification authority.

## History

- See [domain profile changelog](logs.md) for changes to this directory's classification contracts.
