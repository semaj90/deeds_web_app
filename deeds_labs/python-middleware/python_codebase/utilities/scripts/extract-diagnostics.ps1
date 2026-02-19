$in = '.cache\sveltecheck.json'
$out = '.cache\sveltecheck.diagnostics.json'
$reader = [System.IO.File]::OpenText($in)
$writer = [System.IO.File]::CreateText($out)
$buffer = ''
$found = $false
$started = $false
$depth = 0
while (-not $reader.EndOfStream) {
    $line = $reader.ReadLine()
    if (-not $found) {
        $buffer += $line + "`n"
        if ($buffer -match '"diagnostics"\s*:\s*\[') {
            $found = $true
            # find index of '['
            $idx = [regex]::Match($buffer,'"diagnostics"\s*:\s*\[').Index
            $rest = $buffer.Substring($idx)
            $startIdx = $rest.IndexOf('[')
            $after = $rest.Substring($startIdx+1)
            $writer.Write('[')
            foreach ($ch in $after.ToCharArray()) {
                $writer.Write($ch)
                if (-not $started -and $ch -eq '[') { $started = $true; $depth = 1 }
                elseif ($started) {
                    if ($ch -eq '[') { $depth++ }
                    elseif ($ch -eq ']') { $depth--; if ($depth -eq 0) { $writer.Write(']'); $writer.Close(); $reader.Close(); exit 0 } }
                }
            }
            $buffer = $null
        } else {
            if ($buffer.Length -gt 1000000) { $buffer = $buffer.Substring($buffer.Length-1000000) }
        }
    } else {
        foreach ($ch in $line.ToCharArray()) {
            $writer.Write($ch)
            if (-not $started -and $ch -eq '[') { $started = $true; $depth = 1 }
            elseif ($started) {
                if ($ch -eq '[') { $depth++ }
                elseif ($ch -eq ']') { $depth--; if ($depth -eq 0) { $writer.Write(']'); $writer.Close(); $reader.Close(); exit 0 } }
            }
        }
        $writer.Write("`n")
    }
}
$writer.Close(); $reader.Close(); Write-Error 'diagnostics not found'
exit 1
