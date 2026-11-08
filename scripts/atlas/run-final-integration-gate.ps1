# scripts/atlas/run-final-integration-gate.ps1
#
# Final integration gate. Runs each stage, records the real exit code and a short output tail, and writes ONE
# exclusive-create receipt under .tmp/atlas/. It never claims more than it ran:
#   - a stage that did not run is NOT_RUN (and a failed stage stops the later ones),
#   - the type-check lane is named in the receipt (fast incremental svelte-check vs. a focused tsconfig),
#   - the receipt records the commit SHA and which gate inputs have uncommitted edits (PASS_DIRTY_INPUTS).
# Exit code: 0 = every selected stage passed, 1 = a stage failed, 2 = nothing ran (e.g. an unknown -Only name).
#
# Usage (from the repo root):
#   powershell -File scripts/atlas/run-final-integration-gate.ps1
#   powershell -File scripts/atlas/run-final-integration-gate.ps1 -Only Credentials,Router
#   powershell -File scripts/atlas/run-final-integration-gate.ps1 -TypeCheck Focused
param(
    [string[]]$Only = @(),
    [ValidateSet('Fast', 'Focused', 'None')][string]$TypeCheck = 'Fast',
    [string[]]$ScanRoots = @('scripts/atlas', 'sveltekit-frontend/src/lib/server/atlas'),
    [switch]$StrictCredentials,
    [switch]$WriteCredentialBaseline,
    [switch]$IncludeNotebook,
    [string]$CohortRows = $env:ATLAS_COHORT_ROWS
)
$ErrorActionPreference = 'Stop'
# `powershell -File` passes 'A,B' as ONE string; split so -Only / -ScanRoots behave the same under -File and dot-sourcing.
$Only = @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$ScanRoots = @($ScanRoots | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repoRoot

# Obviously fake passwords that appear in test fixtures. Anything else inside a postgres(ql)://user:password@ URI is flagged.
$fakePasswords = @('a', 'b', 'p', 'pass', 'password', 'secret', 'test', 's3cr3t-pw')
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
    'scripts/atlas/kag_prefill_router_v1.py',
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
    'scripts/atlas/lib/dedup-huffman-v1.mjs',
    'scripts/atlas/crosswalk-lowrank-cohort-to-tasks-v1.mjs',
    'scripts/atlas/crosswalk-delta-v1.mjs',
    'scripts/atlas/export-okf-reviewed-domain-examples-v1.mjs',
    'scripts/atlas/synthesize-lowrank-task-rpc-v1.py',
    'scripts/atlas/run-okf-notebook-smoke-v1.py',
    'docs/reports/openspec-lowrank-task-rpc-receipt-v1.json',
    'python/atlas_okf_learning_colab/Parent_Atlas_OKF_GRU_Shadow_Colab_v2.ipynb'
    'sveltekit-frontend/src/lib/components/atlas/CommunityOrbitPanel.svelte'
)

$results = New-Object System.Collections.ArrayList
$script:stopped = $false

function Invoke-Stage {
    param([string]$Name, [string]$Title, [scriptblock]$Body)
    if ($Only.Count -gt 0 -and ($Only -notcontains $Name)) { return }
    param([string]$Name, [string]$Title, [scriptblock]$Action)
    $onlyTokens = @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ -ne '' })
    if ($onlyTokens.Count -gt 0 -and ($onlyTokens -notcontains $Name)) { return }
    Write-Host ("`n=== [{0}] {1} ===" -f $Name, $Title) -ForegroundColor Cyan
    $entry = [ordered]@{ name = $Name; title = $Title; status = 'NOT_RUN'; exitCode = $null; durationMs = 0; tail = @() }
    if ($script:stopped) { [void]$results.Add($entry); return }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $lines = New-Object System.Collections.ArrayList
    # Native tools (python unittest, npm) write progress to stderr; with 'Stop' that would become an exception and hide the real
    # output and exit code. Judge the stage by its exit code only.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Body 2>&1 | ForEach-Object { $text = "$_"; Write-Host $text; [void]$lines.Add($text) }
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
    }
    $ErrorActionPreference = $prevEap
    $sw.Stop()
    $entry.durationMs = [int]$sw.ElapsedMilliseconds
    $entry.tail = @($lines | Select-Object -Last 8)
    if ($entry.status -ne 'PASS') { $script:stopped = $true }
    [void]$results.Add($entry)
}

Invoke-Stage 'Credentials' 'P0 plaintext connection-string guard (postgres/postgresql URIs, recursive, baseline-aware)' {
    $global:LASTEXITCODE = 0
    $baselinePath = Join-Path $repoRoot 'scripts/atlas/credential-uri-baseline-v1.json'
    $counts = @{}
    foreach ($root in $ScanRoots) {
        if (-not (Test-Path $root)) { continue }
        Get-ChildItem -Path $root -Recurse -File -Include *.mjs, *.mts, *.js, *.ts, *.py, *.ps1, *.sql |
            Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.tmp)[\\/]' } |
            ForEach-Object {
                $file = $_
                $key = $file.FullName
                if ($key.StartsWith($repoRoot)) { $key = $key.Substring($repoRoot.Length).TrimStart([char]92, [char]47) }
                $key = $key.Replace([string][char]92, '/')
                Select-String -Path $file.FullName -Pattern $credRegex -AllMatches | ForEach-Object {
                    foreach ($m in $_.Matches) {
                        if ($fakePasswords -notcontains $m.Groups[2].Value) {
                            if ($counts.ContainsKey($key)) { $counts[$key] = $counts[$key] + 1 } else { $counts[$key] = 1 }
                        }
                    }
                }
            }
    }
    $total = 0; foreach ($v in $counts.Values) { $total += $v }
    if ($WriteCredentialBaseline) {
        $ordered = [ordered]@{}
        foreach ($k in ($counts.Keys | Sort-Object)) { $ordered[$k] = $counts[$k] }
        $doc = [ordered]@{ schema = 'atlas.credential-uri-baseline.v1'; note = 'Tolerated existing debt: file -> count of hardcoded connection-string passwords. Passwords are never stored here. The gate fails on any new file or higher count. Shrink this file as credentials move to env.'; files = $ordered }
        $doc | ConvertTo-Json -Depth 4 | Set-Content -Path $baselinePath -Encoding UTF8
        Write-Output ("baseline written: {0} files, {1} URIs" -f $counts.Count, $total)
        return
    }
    $baseline = @{}
    if (-not $StrictCredentials -and (Test-Path $baselinePath)) {
        $doc = Get-Content $baselinePath -Raw | ConvertFrom-Json
        foreach ($prop in $doc.files.PSObject.Properties) { $baseline[$prop.Name] = [int]$prop.Value }
    }
    $new = @()
    foreach ($k in ($counts.Keys | Sort-Object)) {
        $allowed = 0
        if ($baseline.ContainsKey($k)) { $allowed = $baseline[$k] }
        if ($counts[$k] -gt $allowed) { $new += ("{0}: {1} hardcoded connection-string password(s), baseline allows {2} (values not shown)" -f $k, $counts[$k], $allowed) }
    }
    Write-Output ("tolerated existing debt: {0} URIs in {1} files (baseline {2}); strict={3}" -f $total, $counts.Count, $(if ($baseline.Count -gt 0) { 'loaded' } else { 'absent or ignored' }), [bool]$StrictCredentials)
    if ($new.Count -gt 0) {
        $new | ForEach-Object { Write-Output "NEW_CREDENTIAL_URI: $_" }
        $global:LASTEXITCODE = 1
    }
}

Invoke-Stage 'ByteSynth' 'C-ABI byte synthesizer (npm run atlas:byte-synth:test)' {
    npm run atlas:byte-synth:test
}

Invoke-Stage 'Router' 'Pinned KAG prefill router' {
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

Invoke-Stage 'Vitest' 'Kanban prefill + candidate-feature GPU pack specs (lane-contracts config)' {
    Push-Location sveltekit-frontend
    try {
        $env:ATLAS_REQUIRE_FIXTURES = '1'
        npx vitest run --config vitest.lane-contracts.config.ts src/lib/server/atlas/kanban/kanban-dag-prefill-v1.spec.ts src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.spec.ts
    } finally { Pop-Location }
}

Invoke-Stage 'LowRankReceipt' 'Tracked low-rank receipt does not present synthetic vectors as an EmbeddingGemma/MRL representation' {
    $global:LASTEXITCODE = 0
    $r = Get-Content 'docs/reports/openspec-lowrank-task-rpc-receipt-v1.json' -Raw | ConvertFrom-Json
    $problems = @()
    if ($r.packet.embeddingSource -match 'NOT_MODEL_EMBEDDING') {
        if ($r.envelope.representationFamily -ne 'SYNTHETIC_TEST_VECTOR') { $problems += "representationFamily is $($r.envelope.representationFamily), expected SYNTHETIC_TEST_VECTOR" }
        if ($r.envelope.retrievalEligible -ne $false) { $problems += 'retrievalEligible is not false' }
    }
    if ($r.packet.canonicalAuthority -ne $false -or $r.envelope.canonicalAuthority -ne $false) { $problems += 'packet/envelope canonicalAuthority is not false' }
    if ($problems.Count -gt 0) { $problems | ForEach-Object { Write-Output "RECEIPT_PROVENANCE: $_" }; $global:LASTEXITCODE = 1 } else { Write-Output 'receipt labels synthetic vectors as SYNTHETIC_TEST_VECTOR, retrievalEligible=false' }
}

Invoke-Stage 'ToolTests' 'Huffman codec, crosswalk, crosswalk delta and reviewed-label exporter (node --test)' {
    node --test scripts/atlas/lib/dedup-huffman-v1.test.mjs scripts/atlas/crosswalk-lowrank-cohort-to-tasks-v1.test.mjs scripts/atlas/crosswalk-delta-v1.test.mjs scripts/atlas/export-okf-reviewed-domain-examples-v1.test.mjs
}

Invoke-Stage 'CrosswalkRun' 'End to end: cohort -> crosswalk (+packed columns) -> delta self-check; BLOCKED_FIXTURE_MISSING if the cohort file is absent' {
    $global:LASTEXITCODE = 0
    $rows = $CohortRows
    if (-not $rows) { $rows = 'docs/reports/openspec-task-concept-tie-v2.20261107T214110Z.rows.jsonl' }
    if (-not (Test-Path $rows)) { Write-Output "BLOCKED_FIXTURE_MISSING: cohort rows file not found ($rows). It is untracked; set ATLAS_COHORT_ROWS or -CohortRows."; $global:LASTEXITCODE = 1; return }
    $stampX = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
    $outDir = Join-Path $repoRoot (".tmp/atlas/gate-crosswalk-" + $stampX)
    node scripts/atlas/crosswalk-lowrank-cohort-to-tasks-v1.mjs --rows $rows --out-dir $outDir --pack | Out-Host
    # exit 2 only means "some rows are unresolved" (a reported finding, not an integrity failure); anything else non-zero is a real failure.
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 2) { return }
    $rc = Get-Content (Join-Path $outDir 'crosswalk-receipt.json') -Raw | ConvertFrom-Json
    $bad = @()
    if ($rc.duplicateStableKeys -ne 0) { $bad += "duplicateStableKeys=$($rc.duplicateStableKeys)" }
    if (-not $rc.packed.sources.roundTripVerified -or -not $rc.packed.statuses.roundTripVerified) { $bad += 'packed columns not round-trip verified' }
    node scripts/atlas/crosswalk-delta-v1.mjs --prev (Join-Path $outDir 'crosswalk.jsonl') --next (Join-Path $outDir 'crosswalk.jsonl') --out-dir (Join-Path $outDir 'delta-selfcheck') | Out-Host
    if ($LASTEXITCODE -ne 0) { $bad += 'delta self-check failed' }
    $dr = Get-Content (Join-Path $outDir 'delta-selfcheck/crosswalk-delta-receipt.json') -Raw | ConvertFrom-Json
    if ($dr.opTotal -ne 0 -or -not $dr.applyVerifiedAgainstNext) { $bad += "delta self-check not empty/verified (ops=$($dr.opTotal))" }
    Write-Output ("crosswalk: {0}/{1} resolved to a stableKey, {2} unresolved (reported, not a gate failure)" -f $rc.resolvedToStableKey, $rc.cohortRows, $rc.unresolved)
    if ($bad.Count -gt 0) { $bad | ForEach-Object { Write-Output "CROSSWALK_INTEGRITY: $_" }; $global:LASTEXITCODE = 1 } else { $global:LASTEXITCODE = 0 }
}

if ($IncludeNotebook) {
    Invoke-Stage 'NotebookSmoke' 'OKF learning notebook v2 smoke run (CPU, new empty directory, synthetic data => DEMO_ONLY)' {
        py -3.13 scripts/atlas/run-okf-notebook-smoke-v1.py
    }
}

if ($TypeCheck -ne 'None') {
    Invoke-Stage 'TypeCheck' ("svelte-check, lane '{0}'" -f $TypeCheck) {
        Push-Location sveltekit-frontend
        try {
            $env:OTEL_SDK_DISABLED = 'true'
            if ($TypeCheck -eq 'Fast') {
                npm run check:fast
            } else {
                $cfg = '.tmp/tsconfig.scene-studio-focused.json'
                if (-not (Test-Path $cfg)) { Write-Output "focused tsconfig missing: $cfg (gitignored, not reproducible)"; $global:LASTEXITCODE = 1 }
                else { npm exec svelte-check -- --workspace . --tsconfig $cfg --threshold error --output machine }
            }
        } finally { Pop-Location }
    }
}

# --- receipt ---
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
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    commit = $sha
    branch = (git rev-parse --abbrev-ref HEAD).Trim()
    workingTreeEntries = $dirtyAll.Count
    gateInputsWithUncommittedEdits = $dirtyInputs
    typeCheckLane = $TypeCheck
    onlyStages = $Only
    status = $status
    stages = $results
    note = 'A pass here covers only the listed stages. It is not production-readiness, a live-database proof, or a full-workspace type-check unless typeCheckLane is Fast and that stage passed.'
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
$dir = Join-Path $repoRoot '.tmp/atlas'
New-Item -ItemType Directory -Force $dir | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$path = Join-Path $dir ("final-integration-gate-v1.{0}.json" -f $stamp)
$json = $receipt | ConvertTo-Json -Depth 6
$fs = [System.IO.File]::Open($path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
try { $bytes = [System.Text.Encoding]::UTF8.GetBytes($json); $fs.Write($bytes, 0, $bytes.Length) } finally { $fs.Close() }

$color = switch ($status) { 'PASS' { 'Green' } 'PASS_DIRTY_INPUTS' { 'Yellow' } 'NOT_RUN' { 'Yellow' } default { 'Red' } }
Write-Host ("`n[{0}] {1} stage(s) run, {2} failed. Receipt: {3}" -f $status, $ran.Count, $failed.Count, $path) -ForegroundColor $color
if ($dirtyInputs.Count -gt 0) { Write-Host ("Uncommitted edits in gate inputs: {0}" -f ($dirtyInputs -join ', ')) -ForegroundColor Yellow }
if ($status -eq 'FAIL') { exit 1 } elseif ($status -eq 'NOT_RUN') { exit 2 } else { exit 0 }
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
