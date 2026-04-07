#!/usr/bin/env python3
"""
Simple and focused TS1005 error fixer
Targets specific syntax patterns without complex regex
"""

import os
import subprocess
import glob

def run_tsc_count():
    """Get TypeScript error count"""
    try:
        result = subprocess.run(['npx', 'tsc', '--noEmit'], capture_output=True, text=True, cwd='.')
        errors = [line for line in result.stderr.split('\n') if 'error TS' in line]
        return len(errors)
    except:
        return 0

def fix_missing_parentheses(content):
    """Fix common missing parentheses patterns"""
    lines = content.split('\n')

    for i, line in enumerate(lines):
        # Fix unmatched opening parentheses
        if '(' in line and ')' not in line and not line.strip().endswith('{'):
            # Count parentheses
            open_count = line.count('(')
            close_count = line.count(')')
            if open_count > close_count:
                # Add missing closing parentheses
                lines[i] = line.rstrip() + ')' * (open_count - close_count)

        # Fix missing semicolons
        if (line.strip().startswith(('const ', 'let ', 'var ', 'return ')) and
            not line.rstrip().endswith((';', '{', '}')) and
            not line.rstrip().endswith(',')):
            lines[i] = line.rstrip() + ';'

    return '\n'.join(lines)

def fix_generic_brackets(content):
    """Fix missing generic type brackets"""
    lines = content.split('\n')

    for i, line in enumerate(lines):
        # Fix unmatched angle brackets
        if '<' in line and '>' not in line:
            open_count = line.count('<')
            close_count = line.count('>')
            if open_count > close_count:
                lines[i] = line.rstrip() + '>' * (open_count - close_count)

    return '\n'.join(lines)

def fix_missing_commas(content):
    """Fix missing commas in parameter lists"""
    lines = content.split('\n')

    for i in range(len(lines) - 1):
        current_line = lines[i].strip()
        next_line = lines[i + 1].strip()

        # Check if we need a comma between parameters
        if (current_line and not current_line.endswith(',') and
            next_line and not next_line.startswith('}') and
            '(' in lines[max(0, i-2):i+3] and ')' in lines[i:i+5]):
            if current_line.endswith(':') or ' ' in current_line:
                lines[i] = lines[i].rstrip() + ','

    return '\n'.join(lines)

def process_file(file_path):
    """Process a single file with multiple fix approaches"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        original_content = content

        # Apply fixes in sequence
        content = fix_missing_parentheses(content)
        content = fix_generic_brackets(content)
        content = fix_missing_commas(content)

        # Only write if changed
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True

        return False
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False

def main():
    print("Starting simple TS1005 error fixes...")

    initial_count = run_tsc_count()
    print(f"Initial error count: {initial_count}")

    # Get TypeScript files
    ts_files = []
    for pattern in ['src/**/*.ts', 'src/**/*.tsx']:
        ts_files.extend(glob.glob(pattern, recursive=True))

    print(f"Processing {len(ts_files)} TypeScript files...")

    modified = 0
    for file_path in ts_files:
        if process_file(file_path):
            modified += 1
            if modified % 100 == 0:
                print(f"   Modified {modified} files...")

    final_count = run_tsc_count()
    print(f"Final error count: {final_count}")
    print(f"Errors reduced by: {initial_count - final_count}")
    print(f"Files modified: {modified}")

if __name__ == "__main__":
    main()