#!/usr/bin/env python3
"""
Comprehensive TS1005 TypeScript syntax error fixer
Targets the most common patterns causing TS1005 errors
"""

import os
import re
import subprocess
import glob
from pathlib import Path

def run_tsc_check():
    """Run TypeScript check and return error count"""
    try:
        result = subprocess.run([
            'npx', 'tsc', '--noEmit'
        ], capture_output=True, text=True, cwd='.')

        error_lines = [line for line in result.stderr.split('\n') if 'error TS' in line]
        return len(error_lines)
    except Exception as e:
        print(f"Error running tsc: {e}")
        return 0

def get_ts1005_errors():
    """Get specific TS1005 error locations"""
    try:
        result = subprocess.run([
            'npx', 'tsc', '--noEmit'
        ], capture_output=True, text=True, cwd='.')

        ts1005_errors = []
        for line in result.stderr.split('\n'):
            if 'error TS1005' in line:
                # Extract file path and line number
                match = re.match(r'([^(]+)\((\d+),(\d+)\): error TS1005: (.+)', line)
                if match:
                    file_path, line_num, col_num, message = match.groups()
                    ts1005_errors.append({
                        'file': file_path,
                        'line': int(line_num),
                        'col': int(col_num),
                        'message': message
                    })

        return ts1005_errors
    except Exception as e:
        print(f"Error getting TS1005 errors: {e}")
        return []

def fix_missing_parentheses(content, line_num, col_num, message):
    """Fix missing parentheses based on error context"""
    lines = content.split('\n')
    if line_num > len(lines):
        return content

    error_line = lines[line_num - 1]

    # Common patterns for missing parentheses
    if "')' expected" in message:
        # Look for unmatched opening parentheses
        open_parens = error_line.count('(')
        close_parens = error_line.count(')')

        if open_parens > close_parens:
            # Add missing closing parenthesis at the end
            lines[line_num - 1] = error_line.rstrip() + ')'

    elif "'>' expected" in message:
        # Look for unmatched angle brackets in generics
        open_brackets = error_line.count('<')
        close_brackets = error_line.count('>')

        if open_brackets > close_brackets:
            # Add missing closing bracket
            lines[line_num - 1] = error_line.rstrip() + '>'

    elif "';' expected" in message:
        # Add missing semicolon
        if not error_line.rstrip().endswith(';'):
            lines[line_num - 1] = error_line.rstrip() + ';'

    elif "',' expected" in message:
        # Add missing comma (common in parameter lists)
        lines[line_num - 1] = error_line.rstrip() + ','

    return '\n'.join(lines)

def fix_common_syntax_patterns(content):
    """Fix common syntax patterns that cause TS1005 errors"""

    # Fix unmatched parentheses in function calls
    content = re.sub(r'(\w+\([^)]*)\n(\s*}\)', r'\1)\n\2', content, flags=re.MULTILINE)

    # Fix missing semicolons after statements
    content = re.sub(r'^(\s*(?:return|const|let|var|export)\s+[^;{}\n]+)\s*$', r'\1;', content, flags=re.MULTILINE)

    # Fix missing commas in object literals
    content = re.sub(r'^(\s*\w+:\s*[^,}\n]+)\s*$(?=\s*\w+:)', r'\1,', content, flags=re.MULTILINE)

    # Fix unmatched generic brackets
    content = re.sub(r'<([^<>]*?)(?=\s*[({])', r'<\1>', content)

    # Fix arrow function syntax
    content = re.sub(r'=>\s*\{([^}]*)\}(?!\s*[,;)])', r'=> {\1}', content)

    # Fix method call chains with missing parentheses
    content = re.sub(r'\.(\w+)(?=\s*\.)', r'.\1()', content)

    return content

def fix_function_signatures(content):
    """Fix function signature syntax issues"""

    # Fix missing return type annotations
    content = re.sub(r'(\w+\([^)]*\))\s*\{', r'\1: void {', content)

    # Fix async function syntax
    content = re.sub(r'async\s+(\w+\([^)]*\))\s*\{', r'async \1: Promise<void> {', content)

    # Fix generic constraints
    content = re.sub(r'<([^<>]*?)\s+extends\s+([^<>]*?)(?=[>)])', r'<\1 extends \2>', content)

    return content

def fix_import_export_syntax(content):
    """Fix import/export syntax issues"""

    # Fix missing semicolons in imports
    content = re.sub(r"(import\s+[^;]+)\s*(?=\n)", r'\1;', content)

    # Fix missing semicolons in exports
    content = re.sub(r"(export\s+[^;{]+)\s*(?=\n)", r'\1;', content)

    # Fix dynamic import syntax
    content = re.sub(r'import\(([^)]+)\)', r'import(\1)', content)

    return content

def process_file(file_path):
    """Process a single TypeScript file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()

        content = original_content

        # Apply various fixes
        content = fix_common_syntax_patterns(content)
        content = fix_function_signatures(content)
        content = fix_import_export_syntax(content)

        # Get specific TS1005 errors for this file
        ts1005_errors = get_ts1005_errors()
        file_errors = [e for e in ts1005_errors if e['file'].endswith(file_path.replace('\\', '/'))]

        # Apply specific fixes for each error
        for error in file_errors:
            content = fix_missing_parentheses(content, error['line'], error['col'], error['message'])

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
    """Main execution function"""
    print("Starting comprehensive TS1005 error fixes...")

    # Get initial error count
    initial_count = run_tsc_check()
    print(f"Initial TS1005 error count: {initial_count}")

    # Find all TypeScript files
    ts_files = []
    for pattern in ['src/**/*.ts', 'src/**/*.tsx']:
        ts_files.extend(glob.glob(pattern, recursive=True))

    print(f"Found {len(ts_files)} TypeScript files")

    # Process files
    modified_count = 0
    for file_path in ts_files:
        if process_file(file_path):
            modified_count += 1
            if modified_count % 50 == 0:
                print(f"   Processed {modified_count} files...")

    print(f"Modified {modified_count} files")

    # Check final error count
    final_count = run_tsc_check()
    print(f"Final error count: {final_count}")
    print(f"Errors fixed: {initial_count - final_count}")

    print("TS1005 error fixing completed!")

if __name__ == "__main__":
    main()