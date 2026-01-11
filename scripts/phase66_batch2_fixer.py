#!/usr/bin/env python3
"""
Phase 66 Batch 2: Automated CSS Error Fixer
Fixes: box-shadow comma issues and other CSS patterns
"""
import subprocess
import re
import os

def get_error_count():
    """Get current svelte-check error count"""
    result = subprocess.run(
        ['npx', 'svelte-check', '--threshold', 'error'],
        cwd='sveltekit-frontend',
        capture_output=True,
        text=True
    )
    match = re.search(r'found (\d+) errors', result.stdout + result.stderr)
    return int(match.group(1)) if match else 0

def apply_fix_pattern(pattern_from, pattern_to, description):
    """Apply a fix pattern using PowerShell ripgrep"""
    print(f"\n🔧 Applying: {description}")
    ps_cmd = f"""
    $files = rg '{pattern_from}' sveltekit-frontend/src/ -g '*.svelte' -g '*.css' -l 2>$null
    if ($files) {{
        Write-Host "Found $($files.Count) files"
        foreach ($file in $files) {{
            $content = Get-Content $file -Raw
            $newContent = $content -replace '{pattern_from}', '{pattern_to}'
            if ($content -ne $newContent) {{
                Set-Content $file $newContent -NoNewline
                Write-Host "  ✓ $file"
            }}
        }}
    }} else {{
        Write-Host "No files found with pattern"
    }}
    """
    subprocess.run(['powershell', '-Command', ps_cmd], cwd='.')

def commit_fixes(message):
    """Commit changes with git"""
    subprocess.run(['git', 'add', 'sveltekit-frontend/src/'], cwd='.')
    result = subprocess.run(
        ['git', 'commit', '-m', message],
        cwd='.',
        capture_output=True,
        text=True
    )
    if result.returncode == 0:
        print(f"✅ Committed: {message}")
    else:
        print(f"ℹ️  No changes to commit")

def main():
    print("🚀 Phase 66 Batch 2: Automated CSS Fixer")
    print("=" * 60)

    baseline = get_error_count()
    print(f"\n📊 Baseline: {baseline:,} errors")

    # Pattern 1: box-shadow comma issues
    # box-shadow: 0, 0 30px -> box-shadow: 0 0 30px
    apply_fix_pattern(
        r'box-shadow:\s*0,\s*0\s+',
        'box-shadow: 0 0 ',
        'Fix box-shadow: 0, 0 30px → 0 0 30px'
    )

    # Pattern 2: box-shadow with rgba comma issues
    # box-shadow: 0, 0 30px rgba(...) -> box-shadow: 0 0 30px rgba(...)
    apply_fix_pattern(
        r'box-shadow:\s*0,\s*0\s+(\d+)px',
        r'box-shadow: 0 0 $1px',
        'Fix box-shadow: 0, 0 Xpx → 0 0 Xpx'
    )

    errors_after_batch1 = get_error_count()
    fixed_batch1 = baseline - errors_after_batch1

    if fixed_batch1 > 0:
        print(f"\n✨ Batch 1 fixed: {fixed_batch1} errors ({baseline:,} → {errors_after_batch1:,})")
        commit_fixes("fix(css): Batch 2 - Fix box-shadow comma syntax")
    else:
        print("\nℹ️  Batch 1: No fixes applied (patterns already fixed)")

    # Pattern 3: Missing semicolons after closing braces
    # }property: value -> }; property: value
    apply_fix_pattern(
        r'\}\s*([a-z-]+):\s*',
        r'}; $1: ',
        'Fix missing semicolons after braces'
    )

    errors_after_batch2 = get_error_count()
    fixed_batch2 = errors_after_batch1 - errors_after_batch2

    if fixed_batch2 > 0:
        print(f"\n✨ Batch 2 fixed: {fixed_batch2} errors ({errors_after_batch1:,} → {errors_after_batch2:,})")
        commit_fixes("fix(css): Batch 2 - Add missing semicolons after braces")
    else:
        print("\nℹ️  Batch 2: No fixes applied")

    # Final summary
    total_fixed = baseline - errors_after_batch2
    print("\n" + "=" * 60)
    print(f"📊 SUMMARY:")
    print(f"   Baseline:     {baseline:,} errors")
    print(f"   Final:        {errors_after_batch2:,} errors")
    print(f"   Total Fixed:  {total_fixed:,} errors ({total_fixed/baseline*100:.2f}%)")
    print("=" * 60)

if __name__ == "__main__":
    main()
