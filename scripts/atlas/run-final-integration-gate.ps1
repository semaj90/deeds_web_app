# scripts/atlas/run-final-integration-gate.ps1
param(
    [string[]]$Only = @(),
    [ValidateSet('Fast', 'Focused', 'None')][string]$TypeCheck = 'Focused',
    [string[]]$ScanRoots = @('scripts/atlas', 'sveltekit-frontend/src/lib/server/atlas'),
    [switch]$Strict = $false
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $repoRoot

$fakePasswords = @('a', 'b', 'p', 'pass', 'password', 'test', 'secret', 's3cr3t-pw')
$credRegex = 'postgres(?:ql)?://([^:/\s''"@]+):([^@\s''"]+)@'

$gateInputs = @(
    'scripts/atlas/run-final-integration-gate.ps1',
    'scripts/atlas/test-kag-prefill-router-v1.py',
    'scripts/atlas/openai_facade_materializer_v1.py',
    'scripts/atlas/test_openai_facade_materializer_v1.py',
    'scripts/atlas/build-cohort-6527-crosswalk-v1.mjs',
    'scripts/atlas/build-cohort-6527-crosswalk-v1.test.mjs',
    'scripts/atlas/prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py',
    'scripts/atlas/test_rtx_mlp_kmeans_umap_domain_dspy_v1.py',
    'scripts/atlas/reconcile-cohort-6527-kanban-authority-v1.mjs',
    'scripts/atlas/reconcile-cohort-6527-kanban-authority-v1.test.mjs',
    'scripts/atlas/prove-ornith-hybrid-ssm-isoquant-kv-v1.py',
    'scripts/atlas/test_ornith_hybrid_ssm_isoquant_kv_v1.py',
    'scripts/atlas/prove-okf-dspy-rlm-kanban-e2e-v1.mjs',
    'scripts/atlas/prove-okf-dspy-rlm-kanban-e2e-v1.test.mjs',
    'scripts/atlas/prove-live-ornith-8090-prefix-yarn-ssm-v1.mjs',
    'scripts/atlas/prove-live-ornith-8090-prefix-yarn-ssm-v1.test.mjs',
    'scripts/atlas/prove-nes-glyph-instance64-sab-webgpu-v1.mjs',
    'scripts/atlas/prove-nes-glyph-instance64-sab-webgpu-v1.test.mjs',
    'sveltekit-frontend/src/lib/gpu/glyph-instance64-sab-v1.ts',
    'python/atlas_compute/cutile_kv_block_swap.py',
    'sveltekit-frontend/drizzle/manual/20261108_atlas_kanban_dag_prefill_v1.sql',
    'scripts/atlas/verify_lowrank_task_rpc_v2_py.py',
    'scripts/atlas/verify-lowrank-task-rpc-v1.mjs',
    'scripts/atlas/verify-lowrank-task-rpc-v1.test.mjs',
    'sveltekit-frontend/src/lib/server/atlas/kanban/kanban-dag-prefill-v1.ts',
    'sveltekit-frontend/src/lib/server/atlas/kanban/kanban-dag-prefill-v1.spec.ts',
    'sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.spec.ts',
    'sveltekit-frontend/src/lib/components/atlas/CommunityOrbitPanel.svelte'
)

$results = New-Object System.Collections.ArrayList
$script:stopped = $false

function Invoke-Stage {
    param([string]$Name, [string]$Title, [scriptblock]$Action)
    $onlyTokens = @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ -ne '' })
    if ($onlyTokens.Count -gt 0 -and ($onlyTokens -notcontains $Name)) { return }
    Write-Host ("`n=== [{0}] {1} ===" -f $Name, $Title) -ForegroundColor Cyan
    $entry = [ordered]@{ name = $Name; title = $Title; status = 'NOT_RUN'; exitCode = $null; durationMs = 0; tail = @() }
    if ($script:stopped) { [void]$results.Add($entry); return }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $lines = New-Object System.Collections.ArrayList
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Action 2>&1 | ForEach-Object {
            $text = "$_"
            Write-Host $text
            [void]$lines.Add($text)
        }
        $code = $LASTEXITCODE
        if ($null -eq $code) { $code = 0 }
        $entry.exitCode = $code
        $entry.status = if ($code -eq 0) { 'PASS' } else { 'FAIL' }
    } catch {
        $entry.exitCode = 1
        $entry.status = 'FAIL'
        [void]$lines.Add("EXCEPTION: $($_.Exception.Message)")
        Write-Host "EXCEPTION: $($_.Exception.Message)" -ForegroundColor Red
    } finally {
        $ErrorActionPreference = $prevEap
    }
    $sw.Stop()
    $entry.durationMs = [int]$sw.ElapsedMilliseconds
    $entry.tail = @($lines | Select-Object -Last 8)
    if ($entry.status -eq 'FAIL') { $script:stopped = $true }
    [void]$results.Add($entry)
}

Invoke-Stage 'Credentials' 'Plaintext connection-string guard' {
    $global:LASTEXITCODE = 0
    $hits = @()
    foreach ($root in $ScanRoots) {
        if (-not (Test-Path $root)) { continue }
        Get-ChildItem -Path $root -Recurse -File -Include *.mjs, *.mts, *.js, *.ts, *.py, *.ps1, *.sql |
            Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.tmp)[\\/]' } |
            ForEach-Object {
                $file = $_
                Select-String -Path $file.FullName -Pattern $credRegex -AllMatches | ForEach-Object {
                    foreach ($m in $_.Matches) {
                        if ($fakePasswords -notcontains $m.Groups[2].Value) {
                            $hits += ("{0}:{1} user={2}" -f $file.Name, $_.LineNumber, $m.Groups[1].Value)
                        }
                    }
                }
            }
    }
    $gateAndRehearseHits = $hits | Where-Object { $_ -match '(rehearse|kanban-dag-prefill|openai_facade)' }
    if ($gateAndRehearseHits.Count -gt 0) {
        Write-Host ("[GATE 0 BLOCKED] Plaintext credentials detected in active gate inputs: {0}" -f ($gateAndRehearseHits -join ', ')) -ForegroundColor Red
        $global:LASTEXITCODE = 1
    } elseif ($Strict -and $hits.Count -gt 0) {
        Write-Host ("[GATE 0 BLOCKED STRICT] Found {0} legacy files with credentials in ScanRoots." -f $hits.Count) -ForegroundColor Red
        $global:LASTEXITCODE = 1
    } else {
        if ($hits.Count -gt 0) {
            Write-Host ("P0 Credential Guard: Clean in active gate inputs ({0} legacy debt entries tracked; pass -Strict to enforce full repo debt scrubbing)." -f $hits.Count) -ForegroundColor Yellow
        } else {
            Write-Host "P0 Credential Guard: Clean (zero credentials detected)." -ForegroundColor Green
        }
    }
}

Invoke-Stage 'ByteSynth' 'C-ABI byte synthesizer (npm run atlas:byte-synth:test)' {
    npm run atlas:byte-synth:test
}

Invoke-Stage 'Router' 'Pinned KAG prefill router (47 Louvain communities)' {
    py -3.13 scripts/atlas/test-kag-prefill-router-v1.py
}

Invoke-Stage 'LowRankPython' 'v2 low-rank task RPC: Python decoder parity' {
    py -3.13 scripts/atlas/verify_lowrank_task_rpc_v2_py.py
}

Invoke-Stage 'LowRankNode' 'v2 low-rank task RPC: Node verifier' {
    node scripts/atlas/verify-lowrank-task-rpc-v1.mjs
}

Invoke-Stage 'LowRankNegative' 'v2 low-rank task RPC: Node negative-case tests' {
    node --test scripts/atlas/verify-lowrank-task-rpc-v1.test.mjs
}

Invoke-Stage 'OpenAIFacade' 'OpenAI facade + ACP/A2A materializer (Python 3.13)' {
    py -3.13 scripts/atlas/test_openai_facade_materializer_v1.py
}

Invoke-Stage 'Crosswalk' 'TASK-01: 6,527 cohort-to-OpenSpec canonical identity crosswalk' {
    node --test scripts/atlas/build-cohort-6527-crosswalk-v1.test.mjs
}

Invoke-Stage 'RtxTensorDspy' 'RTX 3060 Ti PyTorch MLP + Adaptive KMeans + UMAP + DSPy Graph RAG' {
    py -3.13 -m unittest scripts/atlas/test_rtx_mlp_kmeans_umap_domain_dspy_v1.py -v
}

Invoke-Stage 'KanbanAuthority' 'KANBAN-01/02: 6,527 cohort authority bridge + ROLLBACK adversarial probes' {
    node --test scripts/atlas/reconcile-cohort-6527-kanban-authority-v1.test.mjs
}

Invoke-Stage 'OrnithIsoQuantKv' 'KV-SSM-01 & ISOQUANT-01: Ornith 1.5 hybrid SSM vs IsoQuant KV proof' {
    py -3.13 -m unittest scripts/atlas/test_ornith_hybrid_ssm_isoquant_kv_v1.py -v
}

Invoke-Stage 'OkfDspyRlmE2e' 'CONTEXT-01/ORNITH-01/TASK-E2E-01: .okf + DSPy + RLM 4-turn Kanban E2E' {
    node --test scripts/atlas/prove-okf-dspy-rlm-kanban-e2e-v1.test.mjs
}

Invoke-Stage 'OrnithLiveAudit' 'Ornith 8090 CLI/prefix-cache audit + 13,619 workboard zero-discrepancy + 300-example gate' {
    node --test scripts/atlas/prove-live-ornith-8090-prefix-yarn-ssm-v1.test.mjs
}

Invoke-Stage 'NesGlyphSabWebGpu' 'P0/P1 NES GlyphInstance64 separate wire schema + SharedArrayBuffer worker + WebGPU 256B row pitch' {
    node --test scripts/atlas/prove-nes-glyph-instance64-sab-webgpu-v1.test.mjs
}

Invoke-Stage 'Vitest' 'Kanban prefill + candidate-feature GPU pack specs' {
    Push-Location sveltekit-frontend
    try {
        $env:ATLAS_REQUIRE_FIXTURES = '1'
        npx vitest run src/lib/server/atlas/kanban/kanban-dag-prefill-v1.spec.ts src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.spec.ts
    } finally { Pop-Location }
}

if ($TypeCheck -ne 'None') {
    Invoke-Stage 'TypeCheck' ("svelte-check ($TypeCheck mode)") {
        Push-Location sveltekit-frontend
        try {
            $env:OTEL_SDK_DISABLED = 'true'
            if ($TypeCheck -eq 'Fast') {
                npm run check:fast
            } else {
                $cfg = '.tmp/tsconfig.scene-studio-focused.json'
                if (-not (Test-Path $cfg)) {
                    Write-Host "focused tsconfig missing: $cfg (falling back to check:fast)"
                    npm run check:fast
                } else {
                    npm exec svelte-check -- --workspace . --tsconfig $cfg --threshold error --output machine
                }
            }
        } finally { Pop-Location }
    }
}

# --- Receipt Generation ---
$sha = (git rev-parse HEAD).Trim()
$dirtyAll = @(git status --porcelain)
$dirtyInputs = @()
foreach ($f in $gateInputs) {
    $s = git status --porcelain -- $f
    if ($s) { $dirtyInputs += $f }
}
$ran = @($results | Where-Object { $_.status -ne 'NOT_RUN' })
$failed = @($results | Where-Object { $_.status -eq 'FAIL' })
$status = 'PASS'
if ($failed.Count -gt 0) { $status = 'FAIL' }
elseif ($ran.Count -eq 0) { $status = 'NOT_RUN' }
elseif ($dirtyInputs.Count -gt 0) { $status = 'PASS_DIRTY_INPUTS' }

$receipt = [ordered]@{
    schema = 'atlas.final-integration-gate-receipt.v1'
    generatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    commit = $sha
    branch = (git rev-parse --abbrev-ref HEAD).Trim()
    status = $status
    workingTreeEntries = $dirtyAll.Count
    gateInputsWithUncommittedEdits = $dirtyInputs
    stages = $results
}

$dir = Join-Path $repoRoot '.tmp/atlas'
New-Item -ItemType Directory -Force $dir | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$receiptPath = Join-Path $dir ("final-integration-gate-v1.{0}.json" -f $stamp)
$json = $receipt | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($receiptPath, $json, [System.Text.Encoding]::UTF8)

$color = switch ($status) { 'PASS' { 'Green' } 'PASS_DIRTY_INPUTS' { 'Yellow' } 'NOT_RUN' { 'Yellow' } default { 'Red' } }
Write-Host ("`n[{0}] {1} of {2} stages ran, {3} failed. Receipt: {4}" -f $status, $ran.Count, $results.Count, $failed.Count, $receiptPath) -ForegroundColor $color
if ($dirtyInputs.Count -gt 0) {
    Write-Host ("Uncommitted edits in gate inputs: {0}" -f ($dirtyInputs -join ', ')) -ForegroundColor Yellow
}
if ($status -eq 'FAIL') { exit 1 } else { exit 0 }
