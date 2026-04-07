#!/usr/bin/env python3
import os
import re
import subprocess
from pathlib import Path

def get_typescript_errors():
    """Get TypeScript errors by category"""
    try:
        result = subprocess.run(
            ['npx', 'tsc', '--noEmit'],
            capture_output=True,
            text=True,
            cwd='.',
            timeout=120
        )
        return result.stderr
    except Exception as e:
        print(f"Error running TypeScript check: {e}")
        return ""

def fix_ts1005_syntax_errors():
    """Fix TS1005 syntax errors (missing brackets, parentheses)"""

    fixed_files = []

    # Get specific TS1005 errors
    error_output = get_typescript_errors()
    ts1005_errors = []

    for line in error_output.split('\n'):
        if 'TS1005' in line and ('expected' in line):
            # Parse error location
            match = re.match(r'([^(]+)\((\d+),(\d+)\): error TS1005: (.+)', line)
            if match:
                filepath, line_num, col_num, error_msg = match.groups()
                if filepath.startswith('src/'):  # Skip .svelte-kit generated files
                    ts1005_errors.append({
                        'file': filepath,
                        'line': int(line_num),
                        'column': int(col_num),
                        'message': error_msg
                    })

    print(f"Found {len(ts1005_errors)} TS1005 errors in source files")

    # Group errors by file
    files_to_fix = {}
    for error in ts1005_errors:
        filepath = error['file']
        if filepath not in files_to_fix:
            files_to_fix[filepath] = []
        files_to_fix[filepath].append(error)

    # Fix each file
    for filepath, errors in files_to_fix.items():
        if not os.path.exists(filepath):
            continue

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = f.readlines()

            original_content = ''.join(lines)
            modified = False

            # Sort errors by line number in reverse order (fix from bottom to top)
            errors.sort(key=lambda x: x['line'], reverse=True)

            for error in errors:
                line_idx = error['line'] - 1  # Convert to 0-based index
                col_idx = error['column'] - 1

                if line_idx < len(lines):
                    line = lines[line_idx]

                    # Fix based on error message
                    if "'>' expected" in error['message']:
                        # Missing closing bracket in generic types
                        # Look for Pattern: Promise<Type<SubType
                        if col_idx < len(line):
                            # Add missing '>'
                            line = line[:col_idx] + '>' + line[col_idx:]
                            lines[line_idx] = line
                            modified = True

                    elif "')' expected" in error['message']:
                        # Missing closing parenthesis
                        if col_idx < len(line):
                            # Add missing ')'
                            line = line[:col_idx] + ')' + line[col_idx:]
                            lines[line_idx] = line
                            modified = True

                    elif "';' expected" in error['message']:
                        # Missing semicolon
                        if col_idx < len(line):
                            line = line[:col_idx] + ';' + line[col_idx:]
                            lines[line_idx] = line
                            modified = True

                    elif "',' expected" in error['message']:
                        # Missing comma
                        if col_idx < len(line):
                            line = line[:col_idx] + ',' + line[col_idx:]
                            lines[line_idx] = line
                            modified = True

            if modified:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.writelines(lines)
                fixed_files.append(filepath)

        except Exception as e:
            print(f"Error processing {filepath}: {e}")

    return fixed_files

def fix_common_patterns():
    """Fix common syntax patterns across all TypeScript files"""

    fixed_files = []

    # Find all TypeScript files
    for root, dirs, files in os.walk('src'):
        for file in files:
            if file.endswith('.ts') and not file.endswith('.d.ts'):
                filepath = os.path.join(root, file)

                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()

                    original = content

                    # Fix common patterns

                    # 1. Fix Promise<Type<SubType missing closing >
                    content = re.sub(
                        r'Promise<([^<>]+)<([^<>]+)(?!\>)',
                        r'Promise<\1<\2>>',
                        content
                    )

                    # 2. Fix map/filter/reduce missing closing parentheses
                    content = re.sub(
                        r'\.map\([^)]+\}\s*;',
                        lambda m: m.group(0).replace(';', '));'),
                        content
                    )

                    content = re.sub(
                        r'\.filter\([^)]+\}\s*;',
                        lambda m: m.group(0).replace(';', '));'),
                        content
                    )

                    # 3. Fix arrow functions missing parentheses
                    content = re.sub(
                        r'=>\s*\{[^}]*\}\s*;(?!\))',
                        lambda m: m.group(0).replace(';', ');'),
                        content
                    )

                    # 4. Fix array/object destructuring
                    content = re.sub(
                        r'const\s*\{\s*[^}]+\}\s*=\s*[^;]+(?!\;)',
                        lambda m: m.group(0) + ';',
                        content
                    )

                    # 5. Fix async function calls
                    content = re.sub(
                        r'await\s+[^(]+\([^)]*(?!\))',
                        lambda m: m.group(0) + ')',
                        content
                    )

                    if content != original:
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.write(content)
                        fixed_files.append(filepath)

                except Exception as e:
                    print(f"Error processing {filepath}: {e}")

    return fixed_files

def fix_ts1128_declaration_errors():
    """Fix TS1128 declaration or statement expected errors"""

    fixed_files = []

    for root, dirs, files in os.walk('src'):
        for file in files:
            if file.endswith('.ts'):
                filepath = os.path.join(root, file)

                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()

                    original = content

                    # Fix common TS1128 patterns

                    # 1. Fix orphaned code blocks
                    content = re.sub(
                        r'\n\s*\}\s*\n\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*',
                        r'\n  \1: ',
                        content
                    )

                    # 2. Fix incomplete interface definitions
                    content = re.sub(
                        r'interface\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{[^}]*\n([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([^;]+)(?!\;)',
                        r'interface \1 {\n  \2: \3;',
                        content
                    )

                    # 3. Fix incomplete type definitions
                    content = re.sub(
                        r'type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;]+)(?!\;)',
                        r'type \1 = \2;',
                        content
                    )

                    if content != original:
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.write(content)
                        fixed_files.append(filepath)

                except Exception as e:
                    print(f"Error processing {filepath}: {e}")

    return fixed_files

def main():
    """Main function to fix all TypeScript syntax errors"""

    print("Starting comprehensive TypeScript syntax error fixes...")

    # Get initial error count
    error_output = get_typescript_errors()
    initial_count = len([line for line in error_output.split('\n') if 'error TS' in line])
    print(f"Initial error count: {initial_count}")

    all_fixed_files = []

    # 1. Fix TS1005 syntax errors
    print("\n1. Fixing TS1005 syntax errors...")
    ts1005_files = fix_ts1005_syntax_errors()
    all_fixed_files.extend(ts1005_files)
    print(f"   Fixed TS1005 errors in {len(ts1005_files)} files")

    # 2. Fix common patterns
    print("\n2. Fixing common syntax patterns...")
    pattern_files = fix_common_patterns()
    all_fixed_files.extend(pattern_files)
    print(f"   Fixed patterns in {len(pattern_files)} files")

    # 3. Fix TS1128 declaration errors
    print("\n3. Fixing TS1128 declaration errors...")
    ts1128_files = fix_ts1128_declaration_errors()
    all_fixed_files.extend(ts1128_files)
    print(f"   Fixed TS1128 errors in {len(ts1128_files)} files")

    # Get final error count
    error_output = get_typescript_errors()
    final_count = len([line for line in error_output.split('\n') if 'error TS' in line])

    print(f"\nComprehensive TypeScript fixes completed!")
    print(f"   Files modified: {len(set(all_fixed_files))}")
    print(f"   Error reduction: {initial_count} → {final_count} (-{initial_count - final_count})")

    return set(all_fixed_files)

if __name__ == "__main__":
    main()