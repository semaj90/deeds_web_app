#!/usr/bin/env python3
import os
import re
import sys

def fix_syntax_errors(filepath):
    """Fix common TypeScript syntax errors"""
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    original = lines.copy()
    modified = False

    for i, line in enumerate(lines):
        # Fix unclosed map/filter/reduce parentheses
        # Pattern: .map(...) => ({...}) should be .map(...) => ({...}))
        if re.search(r'\.map\([^)]+\) => \([^)]+\}\);?$', line):
            if not line.rstrip().endswith('));') and not line.rstrip().endswith('));'):
                lines[i] = line.rstrip()[:-1] + '));\n'
                modified = True

        # Fix Promise<Type<SubType> should be Promise<Type<SubType>>
        if 'Promise<' in line and line.count('<') > line.count('>'):
            # Count angle brackets
            open_brackets = line.count('<')
            close_brackets = line.count('>')
            if open_brackets == close_brackets + 1:
                # Find position to insert missing >
                if ' {' in line:
                    lines[i] = line.replace(' {', '> {', 1)
                    modified = True
                elif ');' in line:
                    lines[i] = line.replace(');', '>);', 1)
                    modified = True

        # Fix async function return types
        if re.search(r':\s*Promise<[^>]+<[^>]+>\s*{', line):
            lines[i] = re.sub(r'(:\s*Promise<[^>]+<[^>]+)>\s*{', r'\1>> {', line)
            modified = True

    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        return True
    return False

def find_unclosed_brackets(filepath):
    """Find files with unbalanced brackets"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Skip comments
    content = re.sub(r'//.*?\n', '\n', content)
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)

    # Count brackets
    open_parens = content.count('(')
    close_parens = content.count(')')
    open_braces = content.count('{')
    close_braces = content.count('}')
    open_brackets = content.count('[')
    close_brackets = content.count(']')

    issues = []
    if open_parens != close_parens:
        issues.append(f"Parentheses: {open_parens} open, {close_parens} close")
    if open_braces != close_braces:
        issues.append(f"Braces: {open_braces} open, {close_braces} close")
    if open_brackets != close_brackets:
        issues.append(f"Brackets: {open_brackets} open, {close_brackets} close")

    return issues

def main():
    fixed_count = 0
    total_files = 0
    problematic_files = []

    for root, dirs, files in os.walk('src/lib'):
        for file in files:
            if file.endswith('.ts'):
                filepath = os.path.join(root, file)
                total_files += 1

                # First check for issues
                issues = find_unclosed_brackets(filepath)
                if issues:
                    problematic_files.append((filepath, issues))

                # Try to fix
                if fix_syntax_errors(filepath):
                    fixed_count += 1
                    print(f"Fixed: {filepath}")

    print(f"\nProcessed {total_files} files, fixed {fixed_count} files")

    if problematic_files:
        print(f"\nFiles with unbalanced brackets ({len(problematic_files)}):")
        for filepath, issues in problematic_files[:10]:
            print(f"  {filepath}: {', '.join(issues)}")

if __name__ == "__main__":
    main()