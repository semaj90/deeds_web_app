#!/usr/bin/env python3
import os
import re
import sys

def fix_promise_generics(filepath):
    """Fix unclosed Promise generics in TypeScript files"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Fix patterns like Promise<SomeType<T> { to Promise<SomeType<T>> {
    # This regex looks for Promise< followed by any content with nested < >, ending with > { without the closing >
    pattern = r'Promise<([^>]+<[^>]+)> \{'
    replacement = r'Promise<\1>> {'
    content = re.sub(pattern, replacement, content)

    # Fix patterns for async functions returning Promise with nested generics
    pattern2 = r': Promise<([^>]+<[^>]+)> \{'
    replacement2 = r': Promise<\1>> {'
    content = re.sub(pattern2, replacement2, content)

    # Fix patterns with ResponseOf, StandardApiResponse, etc.
    pattern3 = r'Promise<(ResponseOf|StandardApiResponse|ApiResponse)<([^>]+)> \{'
    replacement3 = r'Promise<\1<\2>> {'
    content = re.sub(pattern3, replacement3, content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    fixed_count = 0
    total_files = 0

    for root, dirs, files in os.walk('src/lib'):
        for file in files:
            if file.endswith('.ts'):
                filepath = os.path.join(root, file)
                total_files += 1
                if fix_promise_generics(filepath):
                    fixed_count += 1
                    print(f"Fixed: {filepath}")

    print(f"\nProcessed {total_files} files, fixed {fixed_count} files")

if __name__ == "__main__":
    main()