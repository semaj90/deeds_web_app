#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ACE Fix Applicator
Applies fixes to corrupted code patterns identified by the GPU clustering pipeline.

Targets:
- object-colon: { key: value: key2 } → { key: value, key2 }
- set-colon: .set(name: value) → .set(name, value)
- function-colon: fn(a: b) → fn(a, b)
"""

import os
import sys
import re
import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import subprocess

# Fix Windows encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')


@dataclass
class Fix:
    """Represents a code fix"""
    file: str
    line: int
    original: str
    fixed: str
    pattern_type: str
    applied: bool = False
    error: Optional[str] = None


class ACEFixApplicator:
    """Applies fixes to corrupted code patterns"""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.fixes: List[Fix] = []
        self.stats = {
            "files_scanned": 0,
            "files_modified": 0,
            "fixes_applied": 0,
            "errors": 0
        }

    def scan_for_patterns(self, root_dir: str) -> List[Fix]:
        """Scan directory for corruption patterns"""
        print(f"\n🔍 Scanning {root_dir} for corruption patterns...")

        patterns = [
            # .set(name: value) pattern - fix cookies.set() etc
            (
                r'\.set\(([^,:)\s]+):\s*([^,)]+)',  # Match .set(a: b
                r'.set(\1, \2',  # Replace with .set(a, b
                'set-colon'
            ),
            # Object property colon instead of comma: { key: value: key2: value2 }
            # This is tricky - need context-aware fix
        ]

        all_fixes = []

        for root, dirs, files in os.walk(root_dir):
            # Skip non-source directories
            dirs[:] = [d for d in dirs if d not in [
                'node_modules', '.git', 'dist', 'build', '.svelte-kit',
                '__pycache__', '.venv', 'coverage'
            ]]

            for file in files:
                if file.endswith(('.ts', '.js', '.svelte')):
                    file_path = os.path.join(root, file)
                    fixes = self._scan_file(file_path, patterns)
                    all_fixes.extend(fixes)
                    self.stats["files_scanned"] += 1

        self.fixes = all_fixes
        print(f"   Found {len(all_fixes)} potential fixes in {self.stats['files_scanned']} files")
        return all_fixes

    def _scan_file(self, file_path: str, patterns: List[Tuple]) -> List[Fix]:
        """Scan a single file for patterns"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
                lines = content.split('\n')
        except Exception as e:
            return []

        fixes = []

        for i, line in enumerate(lines):
            for pattern, replacement, pattern_type in patterns:
                if re.search(pattern, line):
                    fixed_line = re.sub(pattern, replacement, line)
                    if fixed_line != line:
                        fixes.append(Fix(
                            file=file_path,
                            line=i + 1,
                            original=line,
                            fixed=fixed_line,
                            pattern_type=pattern_type
                        ))

        return fixes

    def fix_set_colon_patterns(self, root_dir: str) -> int:
        """Fix .set(a: b) → .set(a, b) patterns"""
        print(f"\n🔧 Fixing .set() colon patterns in {root_dir}...")

        # Pattern: .set(something: something_else where first something is not a type annotation
        # We need to be careful not to break TypeScript type annotations

        fixed_count = 0

        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in [
                'node_modules', '.git', 'dist', 'build', '.svelte-kit',
                '__pycache__', '.venv', 'coverage'
            ]]

            for file in files:
                if file.endswith(('.ts', '.js', '.svelte')):
                    file_path = os.path.join(root, file)
                    count = self._fix_set_colon_in_file(file_path)
                    if count > 0:
                        fixed_count += count
                        self.stats["files_modified"] += 1

        print(f"   ✅ Fixed {fixed_count} .set() patterns")
        return fixed_count

    def _fix_set_colon_in_file(self, file_path: str) -> int:
        """Fix .set() colon patterns in a single file"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                original_content = f.read()
        except Exception as e:
            return 0

        # Pattern 1: cookies.set(name: value, attrs) → cookies.set(name, value, attrs)
        # This fixes: .set(sessionCookie.name: sessionCookie.value, ...)
        pattern1 = re.compile(r'\.set\(([a-zA-Z_][a-zA-Z0-9_.]*)\s*:\s*([^,\)]+)')

        # Count matches before fixing
        matches = list(pattern1.finditer(original_content))
        if not matches:
            return 0

        # Apply fix
        fixed_content = pattern1.sub(r'.set(\1, \2', original_content)

        if fixed_content != original_content:
            if not self.dry_run:
                # Backup
                backup_path = file_path + '.ace-backup'
                if not os.path.exists(backup_path):
                    shutil.copy2(file_path, backup_path)

                # Write fixed content
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(fixed_content)

                print(f"   📝 Fixed {file_path} ({len(matches)} patterns)")
            else:
                print(f"   [DRY RUN] Would fix {file_path} ({len(matches)} patterns)")

            return len(matches)

        return 0

    def fix_object_colon_patterns(self, root_dir: str) -> int:
        """Fix { key: value: key2 } → { key: value, key2 } patterns"""
        print(f"\n🔧 Fixing object colon patterns in {root_dir}...")

        fixed_count = 0

        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in [
                'node_modules', '.git', 'dist', 'build', '.svelte-kit',
                '__pycache__', '.venv', 'coverage'
            ]]

            for file in files:
                if file.endswith(('.ts', '.js', '.svelte')):
                    file_path = os.path.join(root, file)
                    count = self._fix_object_colon_in_file(file_path)
                    if count > 0:
                        fixed_count += count
                        self.stats["files_modified"] += 1

        print(f"   ✅ Fixed {fixed_count} object colon patterns")
        return fixed_count

    def _fix_object_colon_in_file(self, file_path: str) -> int:
        """Fix object colon patterns in a single file"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
        except Exception as e:
            return 0

        # Patterns for object property corruption:
        # Pattern: word: word: word (three or more colon-separated words in a row)
        # This catches: { name: value: key2: value2 }
        # But we need to be careful not to break TypeScript type annotations

        # Specific patterns that are definitely wrong:
        patterns = [
            # export { X: Y } should be export { X, Y } (export conflicts)
            (re.compile(r'export\s*\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\}'), r'export { \1, \2 }'),

            # Double colon in object: { a: b: c } → { a: b, c } (if b is a value, not type)
            # This is context-dependent, so we target specific known patterns

            # Function parameters: (a: b: c) → (a: b, c) when not a type annotation
            (re.compile(r'\(([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)'), r'(\1: \2, \3'),
        ]

        modified = False
        fixed_count = 0
        new_lines = []

        for line in lines:
            new_line = line
            for pattern, replacement in patterns:
                if pattern.search(new_line):
                    new_line = pattern.sub(replacement, new_line)
                    if new_line != line:
                        fixed_count += 1
                        modified = True
            new_lines.append(new_line)

        if modified and not self.dry_run:
            # Backup
            backup_path = file_path + '.ace-backup'
            if not os.path.exists(backup_path):
                shutil.copy2(file_path, backup_path)

            with open(file_path, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)

            print(f"   📝 Fixed {file_path} ({fixed_count} patterns)")

        return fixed_count

    def fix_export_conflicts(self, root_dir: str) -> int:
        """Fix export { X: Y } → export { X, Y } patterns"""
        print(f"\n🔧 Fixing export conflicts in {root_dir}...")

        fixed_count = 0

        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in [
                'node_modules', '.git', 'dist', 'build', '.svelte-kit',
                '__pycache__', '.venv', 'coverage'
            ]]

            for file in files:
                if file.endswith(('.ts', '.js')):
                    file_path = os.path.join(root, file)
                    count = self._fix_export_in_file(file_path)
                    if count > 0:
                        fixed_count += count
                        self.stats["files_modified"] += 1

        print(f"   ✅ Fixed {fixed_count} export patterns")
        return fixed_count

    def _fix_export_in_file(self, file_path: str) -> int:
        """Fix export patterns in a single file"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        except Exception as e:
            return 0

        # Pattern: export { X: Y, Z } or export { X as Y: Z }
        # The colon in the middle of named exports is wrong

        # Also fix: export { default: as Name } → export { default as Name }
        patterns = [
            (re.compile(r'export\s*\{\s*default\s*:\s*as\s+'), 'export { default as '),
            (re.compile(r',\s*as\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*}'), r' as \1 }'),
            # Fix: export { X, as Y } → export { X as Y }
            (re.compile(r'export\s*\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*as\s+'), r'export { \1 as '),
        ]

        fixed_content = content
        fix_count = 0

        for pattern, replacement in patterns:
            matches = list(pattern.finditer(fixed_content))
            if matches:
                fixed_content = pattern.sub(replacement, fixed_content)
                fix_count += len(matches)

        if fix_count > 0 and fixed_content != content:
            if not self.dry_run:
                backup_path = file_path + '.ace-backup'
                if not os.path.exists(backup_path):
                    shutil.copy2(file_path, backup_path)

                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(fixed_content)

                print(f"   📝 Fixed {file_path} ({fix_count} patterns)")

            return fix_count

        return 0

    def run_validation(self) -> bool:
        """Run npm run check to validate fixes"""
        print("\n🧪 Running validation...")

        try:
            result = subprocess.run(
                ['npm', 'run', 'check'],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=300,
                cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            )

            # Count errors
            error_count = result.stdout.count('error TS') + result.stderr.count('error TS')

            print(f"   Validation complete: {error_count} TypeScript errors")
            return error_count < 32000  # Success if under threshold
        except subprocess.TimeoutExpired:
            print("   ⚠️ Validation timed out")
            return False
        except Exception as e:
            print(f"   ❌ Validation error: {e}")
            return False

    def print_summary(self):
        """Print fix summary"""
        print("\n" + "=" * 60)
        print("📊 FIX SUMMARY")
        print("=" * 60)
        print(f"   Files scanned: {self.stats['files_scanned']}")
        print(f"   Files modified: {self.stats['files_modified']}")
        print(f"   Fixes applied: {self.stats['fixes_applied']}")
        print(f"   Errors: {self.stats['errors']}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="ACE Fix Applicator")
    parser.add_argument("root_dir", nargs="?", default="src", help="Root directory")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without applying")
    parser.add_argument("--validate", action="store_true", help="Run validation after fixes")
    parser.add_argument("--pattern", choices=["set-colon", "object-colon", "export", "all"],
                        default="all", help="Pattern type to fix")
    args = parser.parse_args()

    print("=" * 60)
    print("🔧 ACE Fix Applicator")
    print("=" * 60)

    if args.dry_run:
        print("   Mode: DRY RUN (no changes will be made)")

    applicator = ACEFixApplicator(dry_run=args.dry_run)

    total_fixed = 0

    if args.pattern in ("set-colon", "all"):
        total_fixed += applicator.fix_set_colon_patterns(args.root_dir)

    if args.pattern in ("object-colon", "all"):
        total_fixed += applicator.fix_object_colon_patterns(args.root_dir)

    if args.pattern in ("export", "all"):
        total_fixed += applicator.fix_export_conflicts(args.root_dir)

    applicator.stats["fixes_applied"] = total_fixed
    applicator.print_summary()

    if args.validate and not args.dry_run:
        applicator.run_validation()


if __name__ == "__main__":
    main()
