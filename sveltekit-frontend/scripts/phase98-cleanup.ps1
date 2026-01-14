param(
    [switch]$Apply,
    [switch]$DryRun = $true
)

$rootPath = "c:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
$Global:countFixed = 0
$Global:totalMatches = 0

function Repair-File {
    param(
        [string]$Path,
        [string]$Pattern,
        [string]$Replacement,
        [string]$Description
    )

    if (-not (Test-Path $Path)) { return }

    $content = [System.IO.File]::ReadAllText($Path)
    $newContent = $content -replace $Pattern, $Replacement

    if ($content -ne $newContent) {
        $Global:totalMatches++
        Write-Host "[$Description] Found match in: $Path" -ForegroundColor Cyan

        if ($Apply) {
            [System.IO.File]::WriteAllText($Path, $newContent)
            $Global:countFixed++
            Write-Host "  ✅ Fixed" -ForegroundColor Green
        }
    }
}

# --- Fix Group 1: Syntax Corruption (Colons vs Commas) ---

# 1. Cookie Set Colon Fix (Argument lists)
# Pattern: .set(Arg: Arg, -> .set(Arg, Arg,
Repair-File -Path "$rootPath\src\routes\api\auth\logout\+server.ts" `
    -Pattern "cookies\.set\(([^,:]+): ([^,]+)" `
    -Replacement 'cookies.set($1, $2' `
    -Description "Cookie Set Colon Fix"

Repair-File -Path "$rootPath\src\routes\api\auth\demo-login\+server.ts" `
    -Pattern "cookies\.set\(([^,:]+): ([^,]+)" `
    -Replacement 'cookies.set($1, $2' `
    -Description "Cookie Set Colon Fix"

# 2. Redis Set Arrow Fix (Object Literal corruption)
# Pattern: JSON.stringify(coord) => { EX: 86400 }
# Target: JSON.stringify(coord), { EX: 86400 }
Repair-File -Path "$rootPath\src\routes\api\generate-cluster-summaries\+server.ts" `
    -Pattern "JSON\.stringify\(coord\) => \{ EX: 86400 \}" `
    -Replacement "JSON.stringify(coord), { EX: 86400 }" `
    -Description "Redis Set Arrow Fix"

# 3. Broken Comment/Return in Reindex
# Pattern: // If FastAPI ...; return ...
Repair-File -Path "$rootPath\src\routes\api\codebase-index\reindex\+server.ts" `
    -Pattern "(?m)(// If FastAPI is not available);\r?\n\s*return (a mock success)" `
    -Replacement '$1; $2' `
    -Description "Broken Comment Fix"


# --- Fix Group 2: Svelte/Frontend Syntax ---

# 4. Svelte Directive (use, enhance -> use:enhance)
$svelteFiles = Get-ChildItem -Path "$rootPath\src\routes" -Recurse -Filter "*.svelte"
foreach ($file in $svelteFiles) {
    Repair-File -Path $file.FullName `
        -Pattern "use, enhance" `
        -Replacement "use:enhance" `
        -Description "Svelte Use:Enhance Fix"
}

# --- Fix Group 3: Incorrect DB Imports ---

# 5. Fix Import from schema-postgres (should be schema)
# Many files import from $lib/server/db/schema-postgres specifically, which might cause type mismatches if types are augmented in schema.ts
$tsFiles = Get-ChildItem -Path "$rootPath\src" -Recurse -Include "*.ts","*.svelte"
foreach ($file in $tsFiles) {
    # Fix 1: import { db } from '$lib/server/db' (Correct) vs '$lib/server/db/schema' (Incorrect)
    Repair-File -Path $file.FullName `
        -Pattern "import \{ db \} from '\$lib/server/db/schema'" `
        -Replacement "import { db } from '`$lib/server/db'" `
        -Description "Import Fix: db from schema -> db from index"

    # Fix 2: import { db } from '$lib/server/db' (Correct) vs '$lib/server/db/client' (Deprecated)
    Repair-File -Path $file.FullName `
        -Pattern "import \{ db \} from '\$lib/server/db/client'" `
        -Replacement "import { db } from '`$lib/server/db'" `
        -Description "Import Fix: db from client -> db from index"

    # Fix 3: Drizzle Select Backticks
    Repair-File -Path $file.FullName `
        -Pattern "sql<number>count\(\*\)" `
        -Replacement "sql<number>``count(*)``" `
        -Description "Drizzle SQL Backtick Fix"

    # Fix 4: Imports from schema-postgres -> schema
    Repair-File -Path $file.FullName `
        -Pattern "from\s+['""]\$lib\/server\/db\/schema-postgres['""]" `
        -Replacement "from '`$lib/server/db/schema'" `
        -Description "Import Fix: schema-postgres -> schema"

    # Fix 5: Imports from client -> db
    Repair-File -Path $file.FullName `
        -Pattern "from\s+['""]\$lib\/server\/db\/client['""]" `
        -Replacement "from '`$lib/server/db'" `
        -Description "Import Fix: client -> db"

    # Fix 6: Missing Tables (conversations/messages -> ragSessions/chatMessages)
    # Target: import { conversations, messages } from ...
    Repair-File -Path $file.FullName `
        -Pattern "import \{ conversations, messages \} from" `
        -Replacement "import { ragSessions as conversations, chatMessages as messages } from" `
        -Description "Table Renaming: conversations/messages"

# --- Fix Group 4: Generalized Corruption ---

} # End of Import Fix loop

# --- Fix Group 4: Generalized Corruption ---

# 7. Generalized Function Call Colon Fix
# Pattern: .method(arg1: arg2) or func(arg1: arg2)
# Excludes object literals starting with {
# Matches: .set(key: value), .where(eq(a: b))
# Target: .set(key, value)
$extensions = "*.ts", "*.svelte", "*.js"
$files = Get-ChildItem -Path "$rootPath\src" -Recurse -Include $extensions

foreach ($file in $files) {
    # Fix: .method(a: b) -> .method(a, b)
    # Regex explanation:
    # \.\w+\(      Match method call like .set( or .where(
    # \s*          Optional whitespace
    # (?!\{)       Negative lookahead: Ensure next char is NOT { (start of object)
    # ([^,:{]+)    Capture Group 1: First arg (no commas, colons, or opening braces)
    # :            Match the corrupting colon
    # \s*          Optional whitespace
    # ([^,)]+)     Capture Group 2: Second arg (until comma or closing paren)
    Repair-File -Path $file.FullName `
        -Pattern "(\.\w+\(\s*(?!\{)([^,:{]+)):\s*([^,)]+)" `
        -Replacement '$1, $3' `
        -Description "General Function Colon Fix (.method)"

    # Fix: func(a: b) -> func(a, b)
    # e.g. eq(a: b)
    Repair-File -Path $file.FullName `
        -Pattern "(\b\w+\(\s*(?!\{)([^,:{]+)):\s*([^,)]+)" `
        -Replacement '$1, $3' `
        -Description "General Function Colon Fix (func)"

    # Fix: Mixed ?? || operators
    # Pattern: a ?? b || c -> (a ?? b) || c
    # This is tricky with regex. Targeting specific common cases from logs.
    # content: point.payload?.content ?? point.payload?.text || '',
    Repair-File -Path $file.FullName `
        -Pattern "(payload\?\.content \?\? payload\?\.text) \|\|" `
        -Replacement "($1) ||" `
        -Description "Mixed Operator Fix (content/text)"

    Repair-File -Path $file.FullName `
        -Pattern "(hit\.payload\?\.title \?\? hit\.payload\?\.source) \|\|" `
        -Replacement "($1) ||" `
        -Description "Mixed Operator Fix (title/source)"

    Repair-File -Path $file.FullName `
        -Pattern "(hit\.payload\?\.content\?\.substring\(0, 200\) \?\? hit\.payload\?\.text\?\.substring\(0, 200\)) \|\|" `
        -Replacement "($1) ||" `
        -Description "Mixed Operator Fix (snippet)"
}


Write-Host "`nTotal Matches Found: $Global:totalMatches"
Write-Host "Total Files Fixed: $Global:countFixed"
if (-not $Apply) {
    Write-Host "`n(Run with -Apply to execute changes)" -ForegroundColor Yellow
}