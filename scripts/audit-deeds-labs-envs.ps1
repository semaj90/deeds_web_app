# Audit deeds_labs environments - READ-ONLY
$ErrorActionPreference = 'SilentlyContinue'
$base = "c:\Users\james\Videos\deeds-web-app\deeds_labs"
$lines = [System.Collections.ArrayList]::new()

function Log($t) { [void]$script:lines.Add($t) }
function Header($t) { Log ""; Log ("=" * 70); Log $t; Log ("=" * 70) }

$notable = @('torch','tensorflow','transformers','onnxruntime','tensorrt','triton','langchain','fastapi','ollama','qdrant_client','sentence_transformers','docling','numpy','scipy','pandas','scikit_learn','accelerate','bitsandbytes','safetensors','huggingface_hub','peft','trl','vllm','deepspeed','flash_attn','auto_gptq','optimum','ctranslate2','chromadb')

function Audit-Venv($name, $path, $desc) {
    Header $desc
    $cfgPath = Join-Path $path "pyvenv.cfg"
    if (Test-Path $cfgPath) {
        Get-Content $cfgPath | ForEach-Object { Log "  $_" }
    } else {
        Log "  NO pyvenv.cfg"
    }
    $hasBin = Test-Path (Join-Path $path "bin")
    $hasScr = Test-Path (Join-Path $path "Scripts")
    Log "  Platform: bin=$hasBin Scripts=$hasScr"

    $sp = $null
    $winSp = Join-Path $path "Lib\site-packages"
    if (Test-Path $winSp) { $sp = $winSp }
    else {
        $libDir = Join-Path $path "lib"
        if (Test-Path $libDir) {
            $pyDir = Get-ChildItem $libDir -Directory -Filter "python*" | Select-Object -First 1
            if ($pyDir) {
                $linSp = Join-Path $pyDir.FullName "site-packages"
                if (Test-Path $linSp) { $sp = $linSp }
            }
        }
    }

    if ($sp) {
        $pkgDirs = @(Get-ChildItem $sp -Directory)
        Log "  Site-packages: $sp"
        Log "  Package dirs: $($pkgDirs.Count)"
        Log "  Notable packages:"
        foreach ($pkg in $notable) {
            $match = $pkgDirs | Where-Object { $_.Name -like "$pkg*" -and $_.Name -notlike "*dist-info" } | Select-Object -First 1
            if ($match) {
                Log "    [x] $($match.Name)"
            }
        }
        $distInfos = @($pkgDirs | Where-Object { $_.Name -like "*dist-info" } | Sort-Object Name)
        Log "  All installed ($($distInfos.Count) packages from dist-info):"
        foreach ($di in $distInfos) {
            $shortName = $di.Name -replace '-[\d].*',''
            Log "    - $shortName"
        }
    } else {
        Log "  Site-packages: NOT FOUND"
        $topItems = @(Get-ChildItem $path -Depth 0 | Select-Object -ExpandProperty Name)
        Log "  Top items: $($topItems -join ', ')"
    }
}

Header "ACTIVE: .venv (project root)"
$activeCfg = "c:\Users\james\Videos\deeds-web-app\.venv\pyvenv.cfg"
if (Test-Path $activeCfg) { Get-Content $activeCfg | ForEach-Object { Log "  $_" } }

Audit-Venv ".venv-phase46" "$base\.venv-phase46" "ARCHIVED: .venv-phase46 (81106 files, 12.14 GB)"
Audit-Venv "phase46-venv" "$base\phase46-venv" "ARCHIVED: phase46-venv (41964 files, 1.10 GB)"
Audit-Venv ".venv-verify" "$base\.venv-verify" "ARCHIVED: .venv-verify (2236 files, 0.06 GB)"

Header "NODE_MODULES IN ARCHIVED PROJECTS"
$projects = @(
    @{P="$base\evidence-service"; L="evidence-service"},
    @{P="$base\legacy-projects\sveltekit-evidence"; L="sveltekit-evidence"},
    @{P="$base\legacy-projects\ingestion-phase66\node-ingestion-api"; L="ingestion-phase66"}
)
foreach ($proj in $projects) {
    Log ""
    Log "--- $($proj.L) ---"
    $pj = Join-Path $proj.P "package.json"
    if (Test-Path $pj) {
        $pkg = Get-Content $pj -Raw | ConvertFrom-Json
        if ($pkg.name) { Log "  Name: $($pkg.name)" }
        $deps = @()
        if ($pkg.dependencies) { $deps = @($pkg.dependencies.PSObject.Properties.Name) }
        $depsStr = $deps -join ', '
        Log "  Dependencies ($($deps.Count)): $depsStr"
    } else { Log "  NO package.json" }
    $nm = Join-Path $proj.P "node_modules"
    if (Test-Path $nm) {
        $fc = @(Get-ChildItem $nm -Recurse -File).Count
        Log "  node_modules files: $fc"
    }
    $hasLock = Test-Path (Join-Path $proj.P "package-lock.json")
    Log "  Has lockfile: $hasLock"
}

Header "CROSS-REFERENCE CHECK"
$vsSettings = Get-Content "c:\Users\james\Videos\deeds-web-app\.vscode\settings.json" -Raw
if ($vsSettings -match "phase46|venv-verify") { Log "  [!] VS Code settings reference archived venv" }
else { Log "  [OK] No VS Code refs to archived venvs" }

$outFile = "c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\deeds-labs-env-audit.txt"
$lines | Out-File $outFile -Encoding UTF8 -Force
Write-Host "Done. $($lines.Count) lines written to $outFile"
