param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Message
)

if ([string]::IsNullOrWhiteSpace($Message)) {
  Write-Error "Commit message is required."
  exit 1
}

$ErrorActionPreference = "Stop"

git add .
git commit -a -m $Message
git pull
git push
