# Store Import Update Script
# Updates all components to use canonical store imports

Write-Host "🔄 Updating component imports to canonical stores..." -ForegroundColor Cyan

$updates = @{
    # Auth store updates
    "from '\$lib/stores/auth-store.svelte'" = "from '\$lib/stores/auth.svelte'"
    "from '\$lib/stores/auth-store'" = "from '\$lib/stores/auth.svelte'"
    'from "$lib/stores/auth-store.svelte"' = 'from "$lib/stores/auth.svelte"'
    'from "$lib/stores/auth-store"' = 'from "$lib/stores/auth.svelte"'
    "from '\$lib/stores/auth-store.svelte.js'" = "from '\$lib/stores/auth.svelte'"
    "from '\$lib/stores/auth.svelte.js'" = "from '\$lib/stores/auth.svelte'"
    "from '\$lib/stores/auth.svelte.ts'" = "from '\$lib/stores/auth.svelte'"

    # AI Assistant store updates
    "from '\$lib/stores/ai-assistant-unified.svelte'" = "from '\$lib/stores/ai-assistant.svelte'"
    'from "$lib/stores/ai-assistant-unified.svelte"' = 'from "$lib/stores/ai-assistant.svelte"'
    "from '\$lib/stores/ai-assistant-unified.svelte.js'" = "from '\$lib/stores/ai-assistant.svelte'"
    "from '\$lib/stores/ai-assistant'" = "from '\$lib/stores/ai-assistant.svelte'"

    # Chat store updates
    'from "$lib/stores/chatStore"' = 'from "$lib/stores/chat.svelte"'
    "from '\$lib/stores/chatStore'" = "from '\$lib/stores/chat.svelte'"
    "from '\$lib/stores/chat'" = "from '\$lib/stores/chat.svelte'"

    # Named imports updates
    '{ authStore }' = '{ auth }'
    '{ chatStore }' = '{ chat }'
}

$filesUpdated = 0
$replacementsMade = 0

# Update components
Get-ChildItem -Path "src\lib\components" -Recurse -Include "*.svelte" | ForEach-Object {
    $file = $_
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue

    if ($content) {
        $originalContent = $content

        foreach ($pattern in $updates.Keys) {
            if ($content -match [regex]::Escape($pattern)) {
                $content = $content -replace [regex]::Escape($pattern), $updates[$pattern]
                $replacementsMade++
            }
        }

        if ($content -ne $originalContent) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            Write-Host "  ✅ Updated: $($file.Name)" -ForegroundColor Green
            $filesUpdated++
        }
    }
}

# Update routes
Get-ChildItem -Path "src\routes" -Recurse -Include "*.svelte" | ForEach-Object {
    $file = $_
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue

    if ($content) {
        $originalContent = $content

        foreach ($pattern in $updates.Keys) {
            if ($content -match [regex]::Escape($pattern)) {
                $content = $content -replace [regex]::Escape($pattern), $updates[$pattern]
                $replacementsMade++
            }
        }

        if ($content -ne $originalContent) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            Write-Host "  ✅ Updated: $($file.Name)" -ForegroundColor Green
            $filesUpdated++
        }
    }
}

Write-Host "`n📊 Update Summary:" -ForegroundColor Magenta
Write-Host "  Files updated: $filesUpdated" -ForegroundColor Cyan
Write-Host "  Replacements made: $replacementsMade" -ForegroundColor Cyan

if ($filesUpdated -eq 0) {
    Write-Host "`n✅ All imports already using canonical stores!" -ForegroundColor Green
} else {
    Write-Host "`n✅ Import updates complete!" -ForegroundColor Green
}
