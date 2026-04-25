param(
  [string]$MigrationFile = "migrations/20251024-add-source_uri-to-documents.sql",
  [string]$DatabaseUrl = $env:DATABASE_URL
)

if (-not $DatabaseUrl) {
  Write-Host "DATABASE_URL environment variable not set. Example: postgresql://user:pass@localhost:5432/dbname" -ForegroundColor Yellow
  exit 1
}

try {
  $uri = [System.Uri]$DatabaseUrl
} catch {
  Write-Host "DATABASE_URL is not a valid URI: $DatabaseUrl" -ForegroundColor Red
  exit 1
}

# Use non-reserved variable names
$pgHost = $uri.Host
$pgPort = $uri.Port
$pgUser = ($uri.UserInfo.Split(':')[0])
$pgPass = ($uri.UserInfo.Split(':')[1])
$pgDb = $uri.AbsolutePath.TrimStart('/')

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Host "psql client not found in PATH. Please install psql (Postgres client) to run this script." -ForegroundColor Yellow
  exit 3
}

$conn = "postgresql://$($pgUser):$($pgPass)@$($pgHost):$($pgPort)/$($pgDb)"
Write-Host "Running migration file: $MigrationFile against $conn" -ForegroundColor Cyan

try {
  & psql $conn -f $MigrationFile
} catch {
  Write-Host "Migration failed: $_" -ForegroundColor Red
  exit 2
}

Write-Host "Migration completed (or was a no-op)." -ForegroundColor Green
Write-Host "If your app still reports missing 'source_uri', consider restarting the app or verifying the documents table with: SELECT column_name FROM information_schema.columns WHERE table_name='documents';" -ForegroundColor Cyan
