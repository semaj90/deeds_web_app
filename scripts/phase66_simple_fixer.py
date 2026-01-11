#!/usr/bin/env python3
"""
Phase 66: Simple Automated Error Fixer
Uses pattern matching to fix common CSS/TypeScript errors
No external dependencies needed
"""

import os
import re
import subprocess
from pathlib import Path

WORKSPACE = Path(__file__).parent.parent
FRONTEND = WORKSPACE / "sveltekit-frontend"

print("🤖 Phase 66: Simple Automated Error Fixer")
print("=" * 60)

# Common error patterns to fix
FIXES = [
    {
        "name": "Missing semicolons before properties",
        "pattern": r"}(\s*)([a-z\-]+:)",
        "replacement": r";\1\2",
        "files": "*.svelte"
    },
    {
        "name": "Invalid cursor syntax",
        "pattern": r"cursor:\s*not-allowed",
        "replacement": "cursor: not-allowed",
        "files": "*.svelte"
    },
    {
        "name": "Space in property names",
        "pattern": r"(\w+)\s+:\s*(\w+)",
        "replacement": r"\1: \2",
        "files": "*.css,*.svelte"
    }
]

def count_errors():
    """Run svelte-check and count errors"""
    try:
        result = subprocess.run(
            ["npx", "svelte-check", "--threshold", "error"],
            cwd=FRONTEND,
            capture_output=True,
            text=True,
            timeout=300,
            shell=True
        )
        output = result.stdout + result.stderr
        match = re.search(r'found (\d+) errors', output)
        return int(match.group(1)) if match else None
    except:
        return None

def apply_fix(fix):
    """Apply a single fix pattern"""
    print(f"\n🔧 Applying: {fix['name']}")

    # Use PowerShell for the replacement
    ps_cmd = f"""
    $files = Get-ChildItem -Path "{FRONTEND / 'src'}" -Include {fix['files']} -Recurse
    $count = 0
    foreach ($file in $files) {{
        $content = Get-Content $file.FullName -Raw
        $newContent = $content -replace '{fix['pattern']}', '{fix['replacement']}'
        if ($content -ne $newContent) {{
            Set-Content $file.FullName $newContent -NoNewline
            $count++
        }}
    }}
    Write-Output $count
    """

    result = subprocess.run(
        ["powershell", "-Command", ps_cmd],
        capture_output=True,
        text=True
    )

    files_changed = result.stdout.strip()
    print(f"   ✅ Modified {files_changed} files")
    return files_changed

# Main execution
print("\n📊 Getting baseline error count...")
baseline = count_errors()
if baseline:
    print(f"   Starting errors: {baseline}")
else:
    print("   ⚠️  Could not get baseline (continuing anyway)")

for fix in FIXES:
    apply_fix(fix)

print("\n📊 Getting final error count...")
final = count_errors()
if final:
    print(f"   Final errors: {final}")
    if baseline:
        fixed = baseline - final
        print(f"   ✨ Fixed: {fixed} errors")
else:
    print("   ⚠️  Could not get final count")

print("\n✅ Phase 66 Complete!")
