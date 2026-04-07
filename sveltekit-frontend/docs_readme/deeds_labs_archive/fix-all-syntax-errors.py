#!/usr/bin/env python3
import os
import re
import sys

def fix_all_syntax_patterns(filepath):
    """Comprehensive fix for TypeScript syntax errors"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Fix 1: Promise generics with missing closing bracket
    content = re.sub(r'Promise<([^>]+<[^>]+)>\s*{', r'Promise<\1>> {', content)
    content = re.sub(r'Promise<([^>]+<[^>]+)>\s*\)', r'Promise<\1>>)', content)

    # Fix 2: Array/Map/Set generics
    content = re.sub(r'Array<([^>]+<[^>]+)>\s*{', r'Array<\1>> {', content)
    content = re.sub(r'Map<([^,]+),\s*([^>]+<[^>]+)>\s*{', r'Map<\1, \2>> {', content)
    content = re.sub(r'Set<([^>]+<[^>]+)>\s*{', r'Set<\1>> {', content)

    # Fix 3: Function return types with generics
    content = re.sub(r':\s*([A-Za-z]+)<([^>]+<[^>]+)>\s*{', r': \1<\2>> {', content)

    # Fix 4: Type assertions
    content = re.sub(r'as\s+([A-Za-z]+)<([^>]+<[^>]+)>\)', r'as \1<\2>>)', content)

    # Fix 5: Generic function calls
    content = re.sub(r'([a-zA-Z_$][a-zA-Z0-9_$]*)<([^>]+<[^>]+)>\(', r'\1<\2>>(', content)

    # Fix 6: Interface/type definitions
    content = re.sub(r'(interface|type)\s+([A-Za-z]+)<([^>]+)>\s*=\s*([A-Za-z]+)<([^>]+<[^>]+)>;',
                     r'\1 \2<\3> = \4<\5>>;', content)

    # Fix 7: Map/filter/reduce/forEach missing closing parenthesis
    lines = content.split('\n')
    fixed_lines = []

    for i, line in enumerate(lines):
        # Fix map/filter/reduce with arrow functions returning objects
        if re.search(r'\.(map|filter|reduce|forEach|find|some|every|flatMap)\s*\([^)]*=>\s*\({', line):
            # Count parentheses
            open_parens = line.count('(')
            close_parens = line.count(')')

            # Add missing closing parentheses at the end
            if open_parens > close_parens:
                if line.rstrip().endswith('});'):
                    line = line.rstrip()[:-2] + '}));'
                elif line.rstrip().endswith('}):'):
                    line = line.rstrip()[:-3] + '}));'
                elif line.rstrip().endswith('}'):
                    diff = open_parens - close_parens
                    line = line.rstrip() + ')' * diff + ';'

        # Fix async arrow functions
        if 'async' in line and '=>' in line and line.count('(') > line.count(')'):
            if line.rstrip().endswith('{'):
                # This might be okay
                pass
            elif line.rstrip().endswith(';'):
                diff = line.count('(') - line.count(')')
                line = line.rstrip()[:-1] + ')' * diff + ';'

        fixed_lines.append(line)

    content = '\n'.join(fixed_lines)

    # Fix 8: Type parameters in function signatures
    content = re.sub(r'function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)<([^>]+)>\s*\(([^)]*)\)\s*:\s*([^{]+<[^>]+)>\s*{',
                     r'function \1<\2>(\3): \4>> {', content)

    # Fix 9: Class method return types
    content = re.sub(r'(public|private|protected|async)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*:\s*Promise<([^>]+<[^>]+)>\s*{',
                     r'\1 \2(...): Promise<\3>> {', content, flags=re.MULTILINE)

    # Fix 10: Remove extra semicolons after closing braces
    content = re.sub(r'}\s*;\s*;', r'};', content)
    content = re.sub(r'}\)\s*;\s*;', r'});', content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    fixed_count = 0
    total_files = 0

    # Process all TypeScript files
    for root, dirs, files in os.walk('src'):
        # Skip node_modules and .svelte-kit
        if 'node_modules' in root or '.svelte-kit' in root:
            continue

        for file in files:
            if file.endswith('.ts'):
                filepath = os.path.join(root, file)
                total_files += 1

                try:
                    if fix_all_syntax_patterns(filepath):
                        fixed_count += 1
                        print(f"Fixed: {filepath}")
                except Exception as e:
                    print(f"Error processing {filepath}: {e}")

    print(f"\nProcessed {total_files} files, fixed {fixed_count} files")

if __name__ == "__main__":
    main()