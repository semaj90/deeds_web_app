import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compileFeatureMap } from '../src/lib/server/features/feature-map-compiler.js';
import { persistFeatureCompileResult } from '../src/lib/server/features/feature-map-store.js';

async function smokeTestFeatureCompiler() {
  console.log('🚀 Starting FeatureMap Compiler Smoke Test...');

  // 1. Create a dummy feature note
  const testNotePath = 'documents/features/test-feature-hardening.md';
  const absNotePath = resolve(testNotePath);
  mkdirSync(dirname(absNotePath), { recursive: true });

  const noteContent = `---
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
`;

  writeFileSync(absNotePath, noteContent);
  
  // Create dummy SVG
  const svgPath = resolve('static/diagrams/test-arch.svg');
  mkdirSync(dirname(svgPath), { recursive: true });
  writeFileSync(svgPath, '<svg><title>Test Architecture</title><text>Gemma4</text><text>ACE</text></svg>');

  // Create dummy Proto
  const protoPath = resolve('proto/test-service.proto');
  mkdirSync(dirname(protoPath), { recursive: true });
  writeFileSync(protoPath, 'syntax = "proto3"; service TestService { rpc Call(TestRequest) returns (TestResponse); } message TestRequest { string id = 1; }');

  console.log(`📝 Created test feature note and dummy assets.`);

  try {
    // 2. Compile
    console.log('🏗 Compiling FeatureMap...');
    const result = await compileFeatureMap(testNotePath);
    
    console.log('✅ Compilation Successful!');
    console.log(`   Feature ID: ${result.featureMap.featureId}`);
    console.log(`   Title:      ${result.featureMap.title}`);
    console.log(`   Status:     ${result.featureMap.status}`);
    console.log(`   Paths Found: ${Object.values(result.featureMap.paths).flat().length}`);
    console.log(`   Graph Triples: ${result.featureMap.graphTriples.length}`);
    console.log(`   Glyph Mask:  0b${result.featureMap.glyph.mask.toString(2)}`);
    console.log(`   Scores:      Attn=${result.featureMap.scores?.attentionScore.toFixed(3)}, GRPO=${result.featureMap.scores?.grpoUtility.toFixed(3)}`);

    if (result.warnings.length > 0) {
      console.warn('⚠️ Warnings:', result.warnings);
    }

    // 3. Persist
    console.log('💾 Persisting results to Postgres/Redis...');
    await persistFeatureCompileResult(result);
    console.log('✅ Persistence Successful!');

  } catch (err) {
    console.error('❌ Smoke Test Failed:', err);
    process.exit(1);
  }
}

smokeTestFeatureCompiler();
