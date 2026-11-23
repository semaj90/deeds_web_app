[CmdletBinding()]
param(
    [string] $BaseRef = 'origin/main',
    [string] $OutputDirectory = 'docs/reports/branch-audit',
    [switch] $SkipPullRequestMetadata
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-GitText {
    param([Parameter(Mandatory)][string[]] $GitArgs)
    $output = & git @GitArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return $output
}

function Get-BranchDivergence {
    param(
        [Parameter(Mandatory)][string] $Base,
        [Parameter(Mandatory)][string] $Branch
    )
    $counts = Invoke-GitText -GitArgs @('rev-list', '--left-right', '--count', "$Base...$Branch")
    $parts = @(([string]$counts).Trim() -split '\s+')
    if ($parts.Count -ne 2) { throw "Unexpected rev-list count for ${Branch}: $counts" }
    return @{ Ahead = [int]$parts[1]; Behind = [int]$parts[0] }
}

$repoRoot = ([string]@(Invoke-GitText -GitArgs @('rev-parse', '--show-toplevel'))[0]).Trim()
$baseCommit = ([string]@(Invoke-GitText -GitArgs @('rev-parse', '--verify', "$BaseRef^{commit}"))[0]).Trim()
$headCommit = ([string]@(Invoke-GitText -GitArgs @('rev-parse', 'HEAD'))[0]).Trim()
$currentBranch = ([string]@(Invoke-GitText -GitArgs @('branch', '--show-current'))[0]).Trim()
$repoStatus = @(Invoke-GitText -GitArgs @('status', '--porcelain=v1', '--untracked-files=normal'))
$worktrees = @(Invoke-GitText -GitArgs @('worktree', 'list', '--porcelain'))
$worktreeByBranch = @{}
$worktreePath = $null
foreach ($line in $worktrees) {
    if ($line -match '^worktree (.+)$') { $worktreePath = $Matches[1]; continue }
    if ($line -match '^branch refs/heads/(.+)$' -and $worktreePath) {
        $worktreeByBranch[$Matches[1]] = $worktreePath
    }
}

$localTracking = @{}
$localLines = Invoke-GitText -GitArgs @('for-each-ref', '--format=%(refname:short)|%(upstream:short)', 'refs/heads')
foreach ($line in $localLines) {
    $parts = @(([string]$line) -split '\|', 2)
    if ($parts.Count -eq 2 -and $parts[1]) { $localTracking[$parts[1]] = $parts[0] }
}

$pullRequestsByHead = @{}
$ghAvailable = [bool](Get-Command gh -ErrorAction SilentlyContinue)
$pullRequestStatus = if ($SkipPullRequestMetadata) { 'skipped_by_parameter' } elseif (-not $ghAvailable) { 'gh_not_installed' } else { 'unavailable' }
if (-not $SkipPullRequestMetadata -and $ghAvailable) {
    try {
        $prJson = & gh pr list --state all --limit 1000 --json number,title,state,url,headRefName,baseRefName,isDraft,updatedAt,mergeStateStatus 2>&1
        if ($LASTEXITCODE -eq 0) {
            foreach ($pr in @(($prJson -join [Environment]::NewLine) | ConvertFrom-Json)) {
                if (-not $pullRequestsByHead.ContainsKey([string]$pr.headRefName)) {
                    $pullRequestsByHead[[string]$pr.headRefName] = [System.Collections.Generic.List[object]]::new()
                }
                $pullRequestsByHead[[string]$pr.headRefName].Add($pr)
            }
            $pullRequestStatus = 'loaded'
        } else {
            $pullRequestStatus = 'gh_query_failed'
        }
    } catch {
        $pullRequestStatus = 'gh_query_failed'
    }
}

$branchRefs = Invoke-GitText -GitArgs @('for-each-ref', '--format=%(refname:short)|%(objectname)|%(committerdate:iso8601-strict)|%(subject)', 'refs/remotes')
$rows = [System.Collections.Generic.List[object]]::new()
foreach ($line in $branchRefs) {
    $parts = @(([string]$line) -split '\|', 4)
    if ($parts.Count -lt 4) { continue }
    $branchName = $parts[0]
    if ($branchName -eq 'origin/HEAD' -or $branchName -notlike 'origin/*') { continue }

    $divergence = Get-BranchDivergence -Base $BaseRef -Branch $branchName
    $shortName = $branchName.Substring('origin/'.Length)
    $localName = $localTracking[$branchName]
    $localDirty = $null
    $localPath = $null
    if ($localName -and $worktreeByBranch.ContainsKey($localName)) {
        $localPath = $worktreeByBranch[$localName]
        $localStatus = & git -C $localPath status --porcelain=v1 --untracked-files=normal 2>&1
        $localDirty = if ($LASTEXITCODE -eq 0) { @($localStatus).Count -gt 0 } else { $null }
    }

    $prs = if ($pullRequestsByHead.ContainsKey($shortName)) { @($pullRequestsByHead[$shortName].ToArray()) } else { @() }
    $prSummary = @($prs | ForEach-Object { "#$($_.number) $($_.state) $($_.url)" }) -join '; '
    $ahead = [int]$divergence['Ahead']
    $behind = [int]$divergence['Behind']
    $relation = 'unknown'
    if ($ahead -eq 0 -and $behind -eq 0) { $relation = 'equal' }
    elseif ($ahead -gt 0 -and $behind -gt 0) { $relation = 'diverged' }
    elseif ($ahead -gt 0) { $relation = 'ahead' }
    elseif ($behind -gt 0) { $relation = 'behind' }
    $rows.Add([pscustomobject]@{
        RemoteBranch = $branchName
        LocalBranch = $localName
        AheadOfBase = $ahead
        BehindBase = $behind
        RelationToBase = $relation
        LatestCommit = $parts[1]
        LatestCommitDate = $parts[2]
        LatestCommitSubject = $parts[3]
        CheckedOutWorktree = $localPath
        CheckedOutWorktreeDirty = $localDirty
        PullRequestCount = @($prs).Count
        PullRequests = $prSummary
    })
}

$resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputDirectory))
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$csvPath = Join-Path $resolvedOutput "parent-atlas-branches-$stamp.csv"
$jsonPath = Join-Path $resolvedOutput "parent-atlas-branches-$stamp.json"
$report = [pscustomobject]@{
    Report = 'parent-atlas-branch-audit'
    GeneratedAt = (Get-Date).ToUniversalTime().ToString('o')
    RepositoryRoot = $repoRoot
    BaseRef = $BaseRef
    BaseCommit = $baseCommit
    CurrentHead = $headCommit
    CurrentBranch = $currentBranch
    CurrentWorktreeDirty = ($repoStatus.Count -gt 0)
    CurrentWorktreeStatus = @($repoStatus)
    PullRequestMetadataStatus = $pullRequestStatus
    RemoteRefFreshness = 'Uses existing local remote-tracking refs; no fetch was performed. Results may be stale until the operator fetches.'
    BranchCount = $rows.Count
    Branches = @($rows | Sort-Object -Property @{Expression='AheadOfBase';Descending=$true}, @{Expression='BehindBase';Descending=$false}, RemoteBranch)
}

$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding utf8
$report.Branches | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding utf8

[pscustomobject]@{
    Status = 'PASS'
    BranchCount = $report.BranchCount
    BaseRef = $BaseRef
    BaseCommit = $baseCommit
    CurrentWorktreeDirty = $report.CurrentWorktreeDirty
    PullRequestMetadataStatus = $pullRequestStatus
    RemoteRefFreshness = $report.RemoteRefFreshness
    JsonReport = $jsonPath
    CsvReport = $csvPath
} | ConvertTo-Json -Depth 4
