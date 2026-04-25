#!/usr/bin/env pwsh
# scripts/restore-critical-dts.ps1
# Safely overwrite 3 critical .d.ts files with sane baselines

$ErrorActionPreference = "Stop"

function Backup-And-Write($targetPath, $content) {
  if (Test-Path $targetPath) {
    $backup = "$targetPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $targetPath $backup -Force
    Write-Host "Backup: $backup" -ForegroundColor DarkGray
  } else {
    New-Item -ItemType Directory -Path (Split-Path $targetPath) -Force | Out-Null
  }
  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($targetPath, $content, $Utf8NoBom)
  Write-Host "✅ Wrote: $targetPath" -ForegroundColor Green
}

$scriptDir = Split-Path -Parent $PSCommandPath
$root = Split-Path -Parent $scriptDir
$front = Join-Path $root "sveltekit-frontend"

# 1) ambient-legacy.d.ts
$ambientPath = Join-Path $front "src\ambient-legacy.d.ts"
$ambient = @"
// Temporary legacy ambient declarations
declare global {
  interface Window {
    __DEBUG__?: boolean;
    [key: string]: any;
  }
  namespace NodeJS {
    interface ProcessEnv {
      [key: string]: string | undefined;
    }
  }
}
export {};
"@
Backup-And-Write $ambientPath $ambient

# 2) app.d.ts (SvelteKit)
$appPath = Join-Path $front "src\app.d.ts"
$app = @"
import type { Session } from 'lucia';
declare global {
  namespace App {
    interface Locals {
      user?: { id: string; email?: string; role?: string };
      session?: Session;
    }
  }
}
export {};
"@
Backup-And-Write $appPath $app

# 3) env.d.ts (Vite/ImportMeta)
$envPath = Join-Path $front "src\env.d.ts"
$env = @"
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_OLLAMA_URL?: string;
  readonly VITE_QDRANT_URL?: string;
  readonly VITE_REDIS_URL?: string;
  readonly VITE_DATABASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
"@
Backup-And-Write $envPath $env

Write-Host "`n✅ All critical files restored!" -ForegroundColor Cyan
Write-Host "Next: cd sveltekit-frontend; npm run check:typescript" -ForegroundColor Yellow
