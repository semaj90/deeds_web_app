#!/usr/bin/env python3
"""
Fix TS1128 'Declaration or statement expected' errors
These are typically caused by malformed function calls, incomplete statements, and missing parentheses
"""

import os
import re
import glob

def fix_malformed_function_calls(content):
    """Fix malformed function calls like 'function?.(;' -> 'function?.('"""
    # Fix function calls with semicolon after opening parenthesis
    content = re.sub(r'(\w+\?\.\(;)', r'\1', content)
    content = re.sub(r'(\w+\?\.\();', r'\1', content)

    # Fix function calls with missing opening parameters
    content = re.sub(r'(\w+\?\.\(;)', lambda m: m.group(1)[:-1], content)

    return content

def fix_incomplete_statements(content):
    """Fix incomplete statements and expressions"""
    lines = content.split('\n')
    fixed_lines = []

    i = 0
    while i < len(lines):
        line = lines[i]

        # Fix lines ending with incomplete expressions
        if line.strip().endswith('(;'):
            # Remove the semicolon after the opening parenthesis
            fixed_lines.append(line.replace('(;', '('))
        elif line.strip() == ';' and i > 0:
            # Remove standalone semicolons that shouldn't be there
            prev_line = lines[i-1].strip()
            if (prev_line.endswith(',') or
                prev_line.endswith('(') or
                prev_line.endswith('{') or
                '?' in prev_line):
                # Skip this line (remove the standalone semicolon)
                pass
            else:
                fixed_lines.append(line)
        else:
            fixed_lines.append(line)

        i += 1

    return '\n'.join(fixed_lines)

def fix_bracket_mismatches(content):
    """Fix bracket and parenthesis mismatches"""
    # Fix specific patterns like ?.( followed by ; on next line
    content = re.sub(r'\?\.\(\s*;\s*\n', '?.(', content)

    # Fix incomplete conditional calls
    content = re.sub(r'(\w+\?\.\w+\?\.\()\s*;', r'\1', content)

    return content

def fix_broken_property_access(content):
    """Fix broken property access patterns"""
    # Fix patterns like 'object?.method?.(;'
    content = re.sub(r'(\w+\?\.\w+\?\.\(;)', r'\1', content)

    # Fix patterns like 'object?.method?.(  ;'
    content = re.sub(r'(\w+\?\.\w+\?\.\(\s*;)', r'\1', content)

    return content

def process_file(file_path):
    """Process a single TypeScript file"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        original_content = content

        # Apply fixes in order
        content = fix_malformed_function_calls(content)
        content = fix_incomplete_statements(content)
        content = fix_bracket_mismatches(content)
        content = fix_broken_property_access(content)

        # Only write if content changed
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True

        return False

    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False

def main():
    """Main execution"""
    print("Fixing TS1128 'Declaration or statement expected' errors...")

    # Get all TypeScript and generated files that might have TS1128 issues
    file_patterns = [
        '.svelte-kit/**/*.ts',
        'src/**/*.ts',
        'src/**/*.tsx',
        'scripts/**/*.ts'
    ]

    all_files = []
    for pattern in file_patterns:
        all_files.extend(glob.glob(pattern, recursive=True))

    print(f"Processing {len(all_files)} files...")

    modified = 0
    for file_path in all_files:
        if process_file(file_path):
            modified += 1
            if modified % 50 == 0:
                print(f"   Fixed {modified} files...")

    print(f"Fixed TS1128 errors in {modified} files")
    print("TS1128 error fixing completed!")

if __name__ == "__main__":
    main()