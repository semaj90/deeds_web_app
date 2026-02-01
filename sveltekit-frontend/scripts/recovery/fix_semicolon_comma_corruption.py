#!/usr/bin/env python3
"""
Fix semicolon-comma corruption in TypeScript/Svelte files.
Pattern: "type;, property" should be "type, property"
Also fixes: "{, property" should be "{ property"
"""
import re
from pathlib import Path
import sys

def fix_file(file_path: Path) -> tuple[bool, int]:
    """Fix corruption in a single file. Returns (changed, fix_count)."""
    try:
        content = file_path.read_text(encoding='utf-8')
        original = content
        fix_count = 0

        # Pattern 1: type;, property (e.g., "string;, title")
        pattern1 = re.compile(r':\s*(\w+);,\s*([a-zA-Z_])')
        matches = pattern1.findall(content)
        if matches:
            content = pattern1.sub(r': \1, \2', content)
            fix_count += len(matches)

        # Pattern 2: {, property (e.g., "{, priority")
        pattern2 = re.compile(r'\{,\s+([a-zA-Z_])')
        matches = pattern2.findall(content)
        if matches:
            content = pattern2.sub(r'{ \1', content)
            fix_count += len(matches)

        if content != original:
            file_path.write_text(content, encoding='utf-8')
            return True, fix_count

        return False, 0

    except Exception as e:
        print(f"❌ Error processing {file_path}: {e}", file=sys.stderr)
        return False, 0

def main():
    # Target files from grep results
    target_files = [
        'src/lib/server/workers/legal-ai-worker.ts',
        'src/lib/types.ts',
        'src/lib/server/websocket/socket-server.ts',
        'src/lib/cache/MultiLayerCacheSystem.ts',
        'src/lib/stores/unified/citation-store.ts',
        'src/lib/ast/svelte-check-analyzer.ts',
        'src/lib/cache/cache-service.svelte.ts',
        'src/lib/server/db/mirror-query.ts',
        'src/lib/server/ssr/enhanced-load.ts',
    ]

    root = Path(__file__).parent.parent.parent
    total_fixes = 0
    files_changed = 0

    print("🔧 Fixing semicolon-comma corruption...")
    print(f"📂 Root: {root}")
    print()

    for file_rel in target_files:
        file_path = root / file_rel
        if not file_path.exists():
            print(f"⚠️  Not found: {file_rel}")
            continue

        changed, count = fix_file(file_path)
        if changed:
            files_changed += 1
            total_fixes += count
            print(f"✅ Fixed {file_rel} ({count} patterns)")
        else:
            print(f"⏭️  No changes: {file_rel}")

    print()
    print(f"📊 Summary:")
    print(f"   Files changed: {files_changed}")
    print(f"   Total fixes: {total_fixes}")

if __name__ == '__main__':
    main()
