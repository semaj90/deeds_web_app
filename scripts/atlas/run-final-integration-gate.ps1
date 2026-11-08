# scripts/atlas/run-final-integration-gate.ps1
$ErrorActionPreference = "Stop"
Write-Host "=== [STAGE 0] P0 Credential & Worktree Guard ===" -ForegroundColor Cyan
# Ensure no hardcoded fallback passwords exist in rehearsal scripts before testing
$credHits = Select-String -Path "scripts/atlas/*rehearse*" -Pattern "postgres://.*:.*@" -ErrorAction SilentlyContinue
if ($credHits) {
    Write-Error "[GATE 1 BLOCKED] Plaintext connection URI pattern detected in rehearsal scripts. Scrub before proceeding."
}

Write-Host "`n=== [STAGE 1] C-ABI Byte Synthesizer (Radix, LSB0 Bitset, Base32/64/Hex) ===" -ForegroundColor Cyan
npm run atlas:byte-synth:test
if ($LASTEXITCODE -ne 0) { throw "Stage 1 (atlas:byte-synth:test) failed." }

Write-Host "`n=== [STAGE 2] Pinned KAG Prefill Router (47 Louvain Communities, Stamp 20261107T192448Z) ===" -ForegroundColor Cyan
py -3.13 scripts/atlas/test-kag-prefill-router-v1.py
if ($LASTEXITCODE -ne 0) { throw "Stage 2 (test-kag-prefill-router-v1.py) failed." }

Write-Host "`n=== [STAGE 3] Cross-Language v2 Low-Rank RPC Binary Parity (Python + JS + Negative Cases) ===" -ForegroundColor Cyan
py -3.13 scripts/atlas/verify_lowrank_task_rpc_v2_py.py
if ($LASTEXITCODE -ne 0) { throw "Stage 3a (Python v2 decoder) failed." }

node scripts/atlas/verify-lowrank-task-rpc-v1.mjs
if ($LASTEXITCODE -ne 0) { throw "Stage 3b (Node v2 verifier) failed." }

node --test scripts/atlas/verify-lowrank-task-rpc-v1.test.mjs
if ($LASTEXITCODE -ne 0) { throw "Stage 3c (Node v2 negative tests) failed." }

Write-Host "`n=== [STAGE 4] Memory-Bounded Svelte-Check (OTEL Disabled, Focused Scene Studio Config) ===" -ForegroundColor Cyan
Push-Location sveltekit-frontend
try {
    $env:OTEL_SDK_DISABLED = 'true'
    npm exec svelte-check -- --workspace . --tsconfig .tmp/tsconfig.scene-studio-focused.json --threshold error --output machine
    if ($LASTEXITCODE -ne 0) { throw "Stage 4 (focused svelte-check) failed." }
} finally {
    Pop-Location
}

Write-Host "`n[PASS] All 4 integration stages and P0 guards completed cleanly." -ForegroundColor Green
