#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ACE Comprehensive Fix Script
Applies ALL remaining corruption fixes across the codebase
"""

import os
import sys
import re
import shutil
from typing import List, Tuple
from pathlib import Path

# Fix Windows encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')


def fix_all_patterns(root_dir: str = "src"):
    """Apply all fix patterns comprehensively"""

    print("=" * 60)
    print("🔧 ACE Comprehensive Fix Script")
    print("=" * 60)

    # All patterns to fix
    patterns = [
        # .set(name: value) -> .set(name, value)
        (re.compile(r'\.set\(([a-zA-Z_][a-zA-Z0-9_.]*)\s*:\s*([^,\)]+)'), r'.set(\1, \2', 'set-colon'),

        # export { X: Y } -> export { X, Y }
        (re.compile(r'export\s*\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}'), r'export { \1, \2 }', 'export-colon'),

        # export { default: as Name } -> export { default as Name }
        (re.compile(r'export\s*\{\s*default\s*:\s*as\s+'), 'export { default as ', 'export-default'),

        # Map.set(key: value) -> Map.set(key, value)
        (re.compile(r'Map\.set\(([^:]+):\s*([^)]+)\)'), r'Map.set(\1, \2)', 'map-set'),

        # cache.set(key: value) -> cache.set(key, value)
        (re.compile(r'cache\.set\(([^:]+):\s*([^)]+)\)'), r'cache.set(\1, \2)', 'cache-set'),
    ]

    total_fixed = 0
    files_modified = set()

    for root, dirs, files in os.walk(root_dir):
        # Skip non-source directories
        dirs[:] = [d for d in dirs if d not in [
            'node_modules', '.git', 'dist', 'build', '.svelte-kit',
            '__pycache__', '.venv', 'coverage'
        ]]

        for file in files:
            if file.endswith(('.ts', '.js', '.svelte')) and not file.endswith('.ace-backup'):
                file_path = os.path.join(root, file)

                try:
                    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                        original = f.read()
                except Exception:
                    continue

                content = original
                file_fixes = 0

                for pattern, replacement, name in patterns:
                    matches = list(pattern.finditer(content))
                    if matches:
                        content = pattern.sub(replacement, content)
                        file_fixes += len(matches)

                if file_fixes > 0 and content != original:
                    # Create backup if needed
                    backup_path = file_path + '.ace-backup'
                    if not os.path.exists(backup_path):
                        shutil.copy2(file_path, backup_path)

                    # Write fixed content
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)

                    print(f"   📝 {os.path.relpath(file_path)}: {file_fixes} fixes")
                    total_fixed += file_fixes
                    files_modified.add(file_path)

    print(f"\n   ✅ Total fixes: {total_fixed} in {len(files_modified)} files")
    return total_fixed


def fix_lucia_auth_patterns(root_dir: str = "src/lib/server"):
    """Fix specific Lucia auth patterns"""
    print("\n🔐 Fixing Lucia auth patterns...")

    # Specific fix for cookies.set calls
    cookie_pattern = re.compile(
        r'cookies\.set\(([^,]+):\s*([^,]+),\s*([^)]+)\)'
    )

    fixed = 0
    for root, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if d not in ['node_modules', '.git']]

        for file in files:
            if file.endswith(('.ts', '.js')):
                file_path = os.path.join(root, file)

                try:
                    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                        content = f.read()
                except:
                    continue

                original = content

                # Fix cookie.set patterns
                new_content = cookie_pattern.sub(r'cookies.set(\1, \2, \3)', content)

                if new_content != original:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"   📝 {os.path.relpath(file_path)}")
                    fixed += 1

    print(f"   ✅ Fixed {fixed} files")
    return fixed


def cleanup_backups(root_dir: str = "src", delete: bool = False):
    """List or delete backup files"""
    print("\n🗑️ Backup files:")

    backup_count = 0
    for root, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if d not in ['node_modules', '.git']]

        for file in files:
            if file.endswith('.ace-backup'):
                backup_count += 1
                file_path = os.path.join(root, file)
                if delete:
                    os.remove(file_path)
                    print(f"   🗑️ Deleted: {file_path}")
                else:
                    print(f"   📄 {file_path}")

    print(f"   Total backup files: {backup_count}")
    return backup_count


def main():
    import argparse

    parser = argparse.ArgumentParser(description="ACE Comprehensive Fix Script")
    parser.add_argument("root_dir", nargs="?", default="src", help="Root directory")
    parser.add_argument("--cleanup", action="store_true", help="Delete backup files after fix")
    parser.add_argument("--list-backups", action="store_true", help="List backup files")
    args = parser.parse_args()

    if args.list_backups:
        cleanup_backups(args.root_dir)
        return

    # Run all fixes
    total = fix_all_patterns(args.root_dir)
    total += fix_lucia_auth_patterns()

    if args.cleanup:
        cleanup_backups(args.root_dir, delete=True)

    print(f"\n🎯 Grand total: {total} fixes applied")


if __name__ == "__main__":
    main()
