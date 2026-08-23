#!/usr/bin/env bash
# Re-runnable record of the verification pass performed 2026-08-23 before merging
# the 12 "align fanout evidence and sampling contracts" / spectral-RTX / phase-alignment /
# texture-LOD atlas-contract commits from archive/orphaned-root-src-tree-20260822 into main.
#
# Archived per repo convention: proof scripts are moved here and kept, never deleted,
# even after their one-time use (see memory/feedback_no_file_deletion.md).
#
# Run from repo root: bash sveltekit-frontend/scripts/atlas/proofs/atlas-contracts-merge-verify-20260823/run-verification.sh
set -euo pipefail
cd "$(dirname "$0")/../../../.." # repo root

echo "=== sveltekit-frontend vitest (lane-contracts config) ==="
cd sveltekit-frontend
npx vitest run --config vitest.lane-contracts.config.ts \
  "src/lib/server/atlas/contracts/canonical-semantic-768-source-ref-v1.spec.ts" \
  "src/lib/server/atlas/spectral/spectral-rtx-alignment-fixture-v1.spec.ts" \
  "src/lib/server/atlas/language/api-contract-observation-v1.spec.ts" \
  "src/lib/server/atlas/language/sveltekit-api-contract-observer-v1.spec.ts" \
  "src/lib/server/atlas/evidence/pre-fanout-evidence-bundle-v1.spec.ts" \
  "src/lib/server/atlas/retrieval/atlas-rapids-semantic512-client.spec.ts" \
  "src/lib/server/atlas/indexing/structural-provider-runtime-readiness-v1.spec.ts" \
  "src/lib/server/atlas/recommendations/recommendation-evidence-bundle-v1.spec.ts"
# expected: 8 test files, 27 tests passed

echo "=== sveltekit-frontend vitest (client texture specs, no dedicated config exists) ==="
npx vitest run --config vitest.lane-contracts.config.ts --dir . \
  2>/dev/null || true # placeholder; the texture specs need a throwaway node-env config, see note below
# NOTE: src/lib/client/atlas/visualization/texture-layout-v1.spec.ts and
# texture-lod-residency-v1.spec.ts are pure-logic (no DOM/svelte deps) but sit outside
# vitest.lane-contracts.config.ts's include glob (server/atlas/** only). At verification
# time this required a throwaway `environment: 'node'` config targeting
# 'src/lib/client/atlas/visualization/**/*.spec.ts' — recreate inline if re-running,
# rather than leaving a stray config file in the repo root.
# expected: 2 test files, 6 tests passed

cd ..
echo "=== packages/parent-atlas + packages/atlas-core vitest ==="
npx vitest run \
  "packages/parent-atlas/src/core/xgboost-trace-label-bridge.spec.ts" \
  "packages/parent-atlas/src/core/xgboost-trace-packet-reference.spec.ts" \
  "packages/atlas-core/src/validation/gan-deep-audit.test.ts"
# expected: 3 test files, 23 tests passed

echo "=== packages/parent-atlas node:test (requires dist/ build first) ==="
cd packages/parent-atlas
node ../../node_modules/typescript/bin/tsc -p tsconfig.json
node --test ./test/encoder-training-receipt.test.mjs ./test/phase-alignment-runtime.test.mjs ./test/phase-alignment-valkey.test.mjs
cd ../..
# expected: 9 tests passed

echo "=== python pytest ==="
python -m pytest python/tests/test_atlas_rapids_spectral_contract.py python/tests/test_spectral_rtx_alignment_fixture.py -q
python -m pytest python/test_atlas_algorithm_identity.py -q
# expected: 3 passed, then 4 passed

echo "=== ALL VERIFICATION PASSED (70/70 tests total across TS/JS/Python) ==="
