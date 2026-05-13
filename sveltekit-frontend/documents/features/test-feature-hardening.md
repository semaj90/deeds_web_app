---
id: test-feature-hardening
title: Test Feature Hardening
status: implemented
summary: This is a test feature for validating the FeatureMap compiler pipeline.
keywords: [scoreAttention, scoreGRPOReward, runPageRank]
types: [src/lib/server/features/feature-map.types.ts]
services: [src/lib/server/features/feature-map-compiler.ts]
svgDiagrams: [static/diagrams/test-arch.svg]
protos: [proto/test-service.proto]
---

# Test Feature Hardening

## Summary
Validation of the end-to-end synthesis pipeline.

## ACE Context
The FeatureMap compiler is responsible for aggregating AST, RG, and SVG data into a unified JSONB record for the Gemma4 synthesis engine.
