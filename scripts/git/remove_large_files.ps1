# Remove large files from the git index, add them to .gitignore, and commit
# Usage: Open PowerShell at repo root and run:
#   .\scripts\git\remove_large_files.ps1 -BranchName 'feat/your-branch'

param(
  [string]$BranchName = $(git rev-parse --abbrev-ref HEAD 2>$null)
)

if (-not $BranchName) {
  Write-Host "Unable to detect current branch. Provide -BranchName 'branch'"
  exit 1
}

$files = @(
  'docs/documents-atlas-index.json',
  'memory/atlas/documents-atlas.inverted.json',
  'sveltekit-frontend/docs/documents-atlas-index.json',
  'sveltekit-frontend/memory/atlas/documents-atlas.inverted.json',
  'sveltekit-frontend/memory/kb/notecards/graph_file_cards.rank.json'
)

$ignoreEntries = @("/docs/documents-atlas-index.json",
                   "/memory/atlas/documents-atlas.inverted.json",
                   "/sveltekit-frontend/docs/documents-atlas-index.json",
                   "/sveltekit-frontend/memory/atlas/documents-atlas.inverted.json",
                   "/sveltekit-frontend/memory/kb/notecards/graph_file_cards.rank.json")

# Ensure .gitignore exists
if (-not (Test-Path -Path .gitignore)) {
  New-Item -Path .gitignore -ItemType File -Force | Out-Null
}

# Append ignore entries if missing
$existing = Get-Content .gitignore -ErrorAction SilentlyContinue
foreach ($entry in $ignoreEntries) {
  if (-not ($existing -contains $entry)) {
    Add-Content -Path .gitignore -Value $entry
    Write-Host "Added to .gitignore: $entry"
  } else {
    Write-Host "Already in .gitignore: $entry"
  }
}

Write-Host "Updating git index to untrack listed files (if present)..."
foreach ($f in $files) {
  if (Test-Path -Path $f) {
    Write-Host "Unstaging and removing from index: $f"
    git rm --cached --ignore-unmatch -- "$f"
  } else {
    Write-Host "File not found in working tree (skipping): $f"
    # Still attempt --ignore-unmatch to ensure it's removed from index if previously staged
    git rm --cached --ignore-unmatch -- "$f" 2>$null
  }
}

# Stage .gitignore
git add .gitignore

# Commit changes
$commitMsg = 'Remove large artifacts from repo and add to .gitignore (automated)'
$commitResult = & git commit -m "$commitMsg" 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host "Committed: $commitMsg"
  Write-Host "Run: git push origin $BranchName"
} else {
  Write-Host "No commit made (maybe nothing changed). Git output:"
  Write-Host $commitResult
}

Write-Host "Done. If you want to push, run: git push origin $BranchName"