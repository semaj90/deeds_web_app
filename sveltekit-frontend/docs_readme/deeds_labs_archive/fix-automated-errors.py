#!/usr/bin/env python3
"""
Fix specific syntax errors introduced by the automated fix script
Targets the exact patterns shown in Prettier output
"""

import os
import re
import glob

def fix_double_parentheses(content):
    """Fix double closing parentheses that shouldn't be there"""
    # Fix patterns like ));\n -> );\n
    content = re.sub(r'\)\);', ');', content)
    # Fix patterns like ))\s*$ -> )
    content = re.sub(r'\)\)\s*$', ')', content, flags=re.MULTILINE)
    return content

def fix_malformed_function_calls(content):
    """Fix malformed function calls like getAuthHeaders)()"""
    # Fix ...getAuthHeaders)() -> ...getAuthHeaders()
    content = re.sub(r'(\w+)\)\(\)', r'\1()', content)
    # Fix credential)s) -> credentials)
    content = re.sub(r'(\w+)\)s\)', r'\1s)', content)
    # Fix ke)y) -> key)
    content = re.sub(r'(\w+)\)(\w)\)', r'\1\2)', content)
    return content

def fix_generic_brackets(content):
    """Fix malformed generic type brackets"""
    # Fix Promise<T>> -> Promise<T>
    content = re.sub(r'([A-Z]\w*)<([^<>]+)>>', r'\1<\2>', content)
    # Fix Map<string,any>> -> Map<string,any>
    content = re.sub(r'(Map|Set|Array|Promise)<([^<>]+)>>', r'\1<\2>', content)
    return content

def fix_missing_commas(content):
    """Fix missing commas in object/array literals"""
    # Fix missing comma before closing brace after property
    content = re.sub(r'^(\s*\w+:\s*[^,}\n]+)\s*$(?=\s*})', r'\1,', content, flags=re.MULTILINE)
    # Fix function parameter commas
    content = re.sub(r'(\w+:\s*\w+)\s*$(?=\s*\w+:)', r'\1,', content, flags=re.MULTILINE)
    return content

def fix_broken_strings(content):
    """Fix broken string literals and constants"""
    # Fix JOB_STATUS_TT)L) -> JOB_STATUS_TTL)
    content = re.sub(r'([A-Z_]+)TT\)L\)', r'\1TTL)', content)
    # Fix other similar patterns
    content = re.sub(r'([A-Z_]+)\)([A-Z])\)', r'\1\2)', content)
    return content

def fix_interface_export_errors(content):
    """Fix export interface placement errors"""
    # Fix cases where export interface appears after incomplete interface
    lines = content.split('\n')
    fixed_lines = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Look for incomplete interface followed by export interface
        if (i < len(lines) - 2 and
            not line.strip().endswith('}') and
            lines[i + 1].strip() == '' and
            lines[i + 2].strip().startswith('export interface')):

            # Add missing closing brace
            if line.strip() and not line.strip().endswith((',', ';', '{')):
                fixed_lines.append(line.rstrip() + ';')
            else:
                fixed_lines.append(line)
            fixed_lines.append('}')
            fixed_lines.append('')
            fixed_lines.append(lines[i + 2])
            i += 3
        else:
            fixed_lines.append(line)
            i += 1

    return '\n'.join(fixed_lines)

def fix_missing_closing_punctuation(content):
    """Fix missing closing brackets, braces, and parentheses"""
    # Fix missing closing parentheses in function signatures
    content = re.sub(r'(\w+\([^)]*)\s*$(?=\s*\{)', r'\1)', content, flags=re.MULTILINE)
    # Fix missing closing angle brackets in generics
    content = re.sub(r'<([^<>]*)\s*$(?=\s*\{)', r'<\1>', content, flags=re.MULTILINE)
    return content

def process_file(file_path):
    """Process a single TypeScript file"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        original_content = content

        # Apply fixes in order
        content = fix_double_parentheses(content)
        content = fix_malformed_function_calls(content)
        content = fix_generic_brackets(content)
        content = fix_missing_commas(content)
        content = fix_broken_strings(content)
        content = fix_interface_export_errors(content)
        content = fix_missing_closing_punctuation(content)

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
    print("Fixing automated-script-generated syntax errors...")

    # Get all TypeScript and JavaScript files that might have issues
    file_patterns = [
        'src/**/*.ts',
        'src/**/*.tsx',
        'src/**/*.js',
        'scripts/**/*.ts',
        'archived-problematic/**/*.ts'
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

    print(f"Fixed syntax errors in {modified} files")
    print("Automated error fixing completed!")

if __name__ == "__main__":
    main()