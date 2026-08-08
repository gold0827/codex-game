[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$worktreeRoot = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $worktreeRoot) {
    throw "Run this script inside a Git worktree."
}

$commonDir = (& git rev-parse --git-common-dir).Trim()
if ($LASTEXITCODE -ne 0 -or -not $commonDir) {
    throw "Git did not return a common directory."
}

if (-not [System.IO.Path]::IsPathRooted($commonDir)) {
    $commonDir = Join-Path $worktreeRoot $commonDir
}
$commonDir = [System.IO.Path]::GetFullPath($commonDir)
$mainCheckout = Split-Path -Parent $commonDir

$sourceGoal = Join-Path $mainCheckout "goal.md"
$targetGoal = Join-Path $worktreeRoot "goal.md"

if (-not (Test-Path -LiteralPath $sourceGoal -PathType Leaf)) {
    throw "The main checkout does not contain the private goal.md acceptance test."
}

if (-not (Test-Path -LiteralPath $targetGoal -PathType Leaf)) {
    Copy-Item -LiteralPath $sourceGoal -Destination $targetGoal
} elseif ((Get-FileHash -LiteralPath $sourceGoal).Hash -ne
          (Get-FileHash -LiteralPath $targetGoal).Hash) {
    throw "This worktree's goal.md differs from the main checkout."
}

& git -C $worktreeRoot check-ignore --quiet -- goal.md
if ($LASTEXITCODE -ne 0) {
    throw "goal.md is not ignored; refusing to continue."
}

Write-Output "Private acceptance test ready: $targetGoal"
