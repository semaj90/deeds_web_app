#!/usr/bin/env python3
"""
Fix critical syntax errors that prevent compilation
Focused on the specific patterns causing the most issues
"""

import os
import re
import glob

def fix_malformed_function_calls(content):
    """Fix the most common malformed function call patterns"""
    # Fix getAuthHeaders)() -> getAuthHeaders()
    content = re.sub(r'getAuthHeaders\)\(\)', 'getAuthHeaders()', content)

    # Fix function calls with extra closing parenthesis
    content = re.sub(r'(\w+\(\))\)\(\)', r'\1()', content)

    # Fix credential)s) -> credentials)
    content = re.sub(r'credential\)s\)', 'credentials)', content)

    # Fix ke)y) -> key)
    content = re.sub(r'ke\)y\)', 'key)', content)

    # Fix JOB_STATUS_TT)L -> JOB_STATUS_TTL
    content = re.sub(r'JOB_STATUS_TT\)L', 'JOB_STATUS_TTL', content)

    return content

def fix_missing_closing_brackets(content):
    """Fix missing closing brackets and parentheses"""
    # Fix missing closing angle bracket: Promise<T>> -> Promise<T>
    content = re.sub(r'Promise<([^<>]+)>>', r'Promise<\1>', content)
    content = re.sub(r'Array<([^<>]+)>>', r'Array<\1>', content)
    content = re.sub(r'Map<([^<>]+)>>', r'Map<\1>', content)

    # Fix broken function parameter syntax
    content = re.sub(r'\(\s*;\s*', '(', content)

    return content

def fix_interface_issues(content):
    """Fix interface declaration issues"""
    lines = content.split('\n')
    fixed_lines = []

    for i, line in enumerate(lines):
        # Fix incomplete interface declarations
        if line.strip().endswith('{') and i > 0:
            prev_line = lines[i-1].strip()
            if prev_line and not prev_line.endswith((',', ';', '{', '}')) and 'interface' not in prev_line:
                # Previous line needs completion
                if i > 0:
                    fixed_lines[-1] = fixed_lines[-1].rstrip() + ';'

        fixed_lines.append(line)

    return '\n'.join(fixed_lines)

def fix_specific_syntax_errors(content):
    """Fix specific syntax errors seen in Prettier output"""
    # Fix missing comma in object spread
    content = re.sub(r'(\.\.\.[^,}]+)\s*}\)', r'\1,})', content)

    # Fix missing closing parenthesis in return statements
    content = re.sub(r'return Array\.from\([^)]+\s*;\s*$', lambda m: m.group(0).replace(';', ');'), content, flags=re.MULTILINE)

    # Fix broken property access chains
    content = re.sub(r'(\w+\?\.\w+\?\.\()\s*;', r'\1', content)

    return content

def process_file(file_path):
    """Process a single file"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        original_content = content

        # Apply critical fixes only
        content = fix_malformed_function_calls(content)
        content = fix_missing_closing_brackets(content)
        content = fix_interface_issues(content)
        content = fix_specific_syntax_errors(content)

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
    print("Fixing critical syntax errors...")

    # Focus on files that are most likely to have the syntax errors
    file_patterns = [
        'src/**/*.ts',
        'src/**/*.tsx',
        'scripts/**/*.ts',
        '.svelte-kit/**/*.ts'
    ]

    all_files = []
    for pattern in file_patterns:
        all_files.extend(glob.glob(pattern, recursive=True))

    print(f"Processing {len(all_files)} files...")

    modified = 0
    for file_path in all_files:
        if process_file(file_path):
            modified += 1
            if modified % 100 == 0:
                print(f"   Fixed {modified} files...")

    print(f"Fixed critical syntax errors in {modified} files")
    print("Critical syntax error fixing completed!")

if __name__ == "__main__":
    main()