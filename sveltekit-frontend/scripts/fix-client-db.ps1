
$path = "c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\db\client-db.ts"
$content = [System.IO.File]::ReadAllText($path)

# Fix the prop: type: nextProp pattern
$content = $content -replace '(\w+\??)\s*:\s*(number|string|boolean|Date|any|unknown|null)\s*:\s*(\w+)', '$1: $2; $3'

# Fix the prop, type: nextProp pattern
$content = $content -replace '(\w+),\s*(string|number|boolean|Date|any|unknown|null)\s*:\s*(\w+)', '$1: $2; $3'

# Specific fixes for common fields that lost their types or got squashed
$content = $content -replace 'timestamp:\s*metadata\?:', 'timestamp: Date; metadata?:'
$content = $content -replace ',\s*content:', '; content:'
$content = $content -replace ',\s*timestamp:', '; timestamp:'
$content = $content -replace ',\s*lastAccessed:', '; lastAccessed:'
$content = $content -replace ',\s*expiresAt:', '; expiresAt:'
$content = $content -replace ',\s*createdAt:', '; createdAt:'
$content = $content -replace ',\s*updatedAt:', '; updatedAt:'
$content = $content -replace ',\s*confidence:', '; confidence:'
$content = $content -replace ',\s*tokenCount:', '; tokenCount:'
$content = $content -replace ',\s*processingTime:', '; processingTime:'
$content = $content -replace ',\s*computationTime:', '; computationTime:'
$content = $content -replace ',\s*resultCount:', '; resultCount:'
$content = $content -replace ',\s*searchType:', '; searchType:'
$content = $content -replace ',\s*userId:', '; userId:'
$content = $content -replace ',\s*filters:', '; filters:'

# Fix the Date | $1, Date hallucination
$content = $content -replace 'Date\s*\|\s*\$1,\s*Date', 'Date'

# Fix the type: 'user' | ... content: string (missing semicolon)
$content = $content -replace ",\s*content:\s*string", "; content: string"

# Fix the prop: { ... } (missing semicolon before next prop)
$content = $content -replace '}\s*,?\s*(\w+)\s*:\s*(number|string|boolean|Date)', '}; $1: $2'

# Fix [key, string], any
$content = $content -replace '\[key,\s*string\],\s*any', '[key: string]: any'

# Fix id: label?
$content = $content -replace 'id:\s*label\?:', 'id: string; label?:'

[System.IO.File]::WriteAllText($path, $content)
