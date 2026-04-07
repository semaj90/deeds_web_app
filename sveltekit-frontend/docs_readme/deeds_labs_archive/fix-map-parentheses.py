#!/usr/bin/env python3
import os
import re
import sys

def fix_map_filter_parentheses(filepath):
    """Fix unclosed map/filter/reduce parentheses in TypeScript files"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Fix patterns like .map((x) => ({...}); which should be .map((x) => ({...}));
    # This regex looks for .map/.filter/.reduce with arrow function returning object literal
    pattern = r'(\.(map|filter|reduce|forEach|find|some|every|flatMap)\([^)]+\)\s*=>\s*\([^)]+\}\))(;)'
    replacement = r'\1);'
    content = re.sub(pattern, replacement, content)

    # Fix patterns where the closing parenthesis is completely missing
    # Look for .map((x) => ({...}) followed by newline and no closing paren
    pattern2 = r'(\.(map|filter|reduce|forEach|find|some|every|flatMap)\([^)]+\)\s*=>\s*\{[^}]+\})\s*\n'

    lines = content.split('\n')
    for i in range(len(lines) - 1):
        line = lines[i]
        next_line = lines[i + 1] if i + 1 < len(lines) else ''

        # Check if line ends with }); but should be }));
        if re.search(r'\.(map|filter|reduce|forEach|find|some|every|flatMap)\s*\(', line):
            # Count parentheses in the line
            open_count = line.count('(')
            close_count = line.count(')')

            # If we have more opens than closes and line ends with });
            if open_count > close_count and line.rstrip().endswith('});'):
                lines[i] = line.rstrip()[:-2] + '}));'
            elif open_count > close_count and line.rstrip().endswith('}):'):
                lines[i] = line.rstrip()[:-2] + '}));'

    # Also handle multiline map/filter/reduce
    in_map_block = False
    map_indent = 0
    map_start_line = -1

    for i in range(len(lines)):
        line = lines[i]

        # Check if we're starting a map/filter/reduce block
        if re.search(r'\.(map|filter|reduce|forEach|find|some|every|flatMap)\s*\([^)]*$', line):
            in_map_block = True
            map_indent = len(line) - len(line.lstrip())
            map_start_line = i

        # If we're in a map block and find the closing
        if in_map_block and i > map_start_line:
            stripped = line.strip()
            if stripped.startswith('});') or stripped.startswith('})'):
                # Check if we need an extra closing paren
                # Count all parens from map_start_line to current line
                total_open = 0
                total_close = 0
                for j in range(map_start_line, i + 1):
                    total_open += lines[j].count('(')
                    total_close += lines[j].count(')')

                if total_open > total_close:
                    if stripped == '});':
                        lines[i] = line.replace('});', '}));')
                    elif stripped == '}):':
                        lines[i] = line.replace('}):','}));')

                in_map_block = False

    content = '\n'.join(lines)

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
                if fix_map_filter_parentheses(filepath):
                    fixed_count += 1
                    print(f"Fixed: {filepath}")

    print(f"\nProcessed {total_files} files, fixed {fixed_count} files")

if __name__ == "__main__":
    main()