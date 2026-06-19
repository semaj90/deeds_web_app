# Runtime Coverage Audit

Generated: 2026-06-19T20:31:50.285Z

## Summary

- agent_traces rows: 1150
- selected_concepts coverage: 98.96%
- retrieved_packets coverage: 98.61%
- tool_calls coverage: 100%
- route_runtime_packets rows: 33
- runtime low-density rows: 0
- feature-lineage sourceRef coverage: 100%
- feature-lineage featureId coverage: 100%
- feature-lineage higher-hop gaps: 100

## Open Traces

- traces with no selected_concepts: 12
- traces with no retrieved_packets: 16
- traces with no tool_calls: 0

## Notes

- selected_concepts is already persisted in agent_traces, but coverage still matters for planner learning.
- route_runtime_packets reports structural replay data; this audit is read-only.
- feature-lineage coverage is loaded from the existing report when available.
