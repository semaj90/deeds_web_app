#!/usr/bin/env python3
"""
ACE eq() Pattern Fixer
Fixes corrupted eq(a: b) -> eq(a, b) patterns in Drizzle ORM calls
"""

import os
import sys
import re
import shutil

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')


def fix_eq_patterns(root_dir: str = "src"):
    """Fix eq(a: b) -> eq(a, b) patterns"""
    print(f"🔧 Fixing eq() patterns in {root_dir}...")

    # Pattern: eq(something: something) where first part is not a type annotation
    # This catches eq(table.column: value) corruption
    pattern = re.compile(r'\beq\(([a-zA-Z_][a-zA-Z0-9_.]*)\s*:\s*([^)]+)\)')

    total_fixed = 0
    files_modified = 0

    for root, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if d not in [
            'node_modules', '.git', 'dist', '.svelte-kit', '__pycache__'
        ]]

        for file in files:
            if file.endswith(('.ts', '.js', '.svelte')) and not file.endswith('.bak'):
                file_path = os.path.join(root, file)

                try:
                    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                        content = f.read()
                except:
                    continue

                original = content
                matches = list(pattern.finditer(content))

                if matches:
                    content = pattern.sub(r'eq(\1, \2)', content)

                    if content != original:
                        # Backup
                        backup = file_path + '.eq-backup'
                        if not os.path.exists(backup):
                            shutil.copy2(file_path, backup)

                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(content)

                        print(f"   📝 {os.path.relpath(file_path)}: {len(matches)} fixes")
                        total_fixed += len(matches)
                        files_modified += 1

    print(f"\n   ✅ Fixed {total_fixed} eq() patterns in {files_modified} files")
    return total_fixed


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("root_dir", nargs="?", default="src")
    args = parser.parse_args()

    fix_eq_patterns(args.root_dir)


if __name__ == "__main__":
    main()
