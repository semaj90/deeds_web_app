# Fix mixed quotes in enhanced-rag-self-organizing.ts $file = "src\lib\services\enhanced-rag-self-organizing.ts"
$content = Get-Content $file -Raw # Fix patterns: 'text` or `text' $content = $content -replace "typeof process !==
'undefined``", "typeof process !== 'undefined'" $content = $content -replace "typeof window !== ``undefined'", "typeof
window !== 'undefined'" $content = $content -replace "// NEW helper: null/undefined coalescer \(avoids using: '\?\? ``",
"// NEW helper: null/undefined coalescer (avoids using: '??'" $content = $content -replace "\['metadata``\]",
"['metadata']" $content = $content -replace "DocumentChunk\[``metadata'\]", "DocumentChunk['metadata']" $content =
$content -replace " === 'number``", " === 'number'" $content = $content -replace "intent: options.intent \|\|
``research',", "intent: options.intent || 'research'," $content = $content -replace "'query error``", "'query error'"
$content = $content -replace "\.join\(' '\)' '\)', '\)\`\)", ".join(',')}" $content = $content -replace "return
parts\.join\(' '\)' '\)`` \| '\)", "return parts.join(' ') || ''" $content = $content -replace " \| 'neutral``", " |
'neutral'" $content = $content -replace "model: ``gemma3-legal:latest',", "model: 'gemma3-legal:latest'," $content =
$content -replace "\.join\(' '\)' '\)'\n\n``\)", ".join('\n\n')" $content = $content -replace "'LLM analysis failed,
using fallback:``", "'LLM analysis failed, using fallback:'" $content = $content -replace "``applySelfOrganizingFeedback
error',", "'applySelfOrganizingFeedback error'," $content = $content -replace "let fullPrompt = request\.prompt \|\|
'``", "let fullPrompt = request.prompt || ''" $content = $content -replace "method: ``POST',", "method: 'POST',"
$content = $content -replace "'Content-Type': 'application/json``", "'Content-Type': 'application/json'" $content =
$content -replace "``\[OllamaHttpService\] Empty response from Ollama API:',", "'[OllamaHttpService] Empty response from
Ollama API:'," $content = $content -replace "'\[OllamaHttpService\] Ollama API call failed:``", "'[OllamaHttpService]
Ollama API call failed:'" $content = $content -replace "``\[OllamaHttpService\] Falling back to mock response'",
"'[OllamaHttpService] Falling back to mock response'" $content | Set-Content $file -NoNewline Write-Host "✅ Fixed mixed
quotes in $file" -ForegroundColor Green
