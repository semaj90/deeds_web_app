#!/usr/bin/env python3
import os
import re
from pathlib import Path

def fix_specific_files():
    """Fix the specific files mentioned in TS1005 errors"""

    files_to_fix = [
        "src/lib/ai/browser-local-ai.ts",
        "src/lib/ai/langchain-rag.ts",
        "src/lib/ai/realtime-ui-orchestration.ts",
        "src/lib/ai/unified-cache-enhanced-orchestrator.ts",
        "src/lib/ai/vector-metadata-auto-encoder.ts",
        "src/lib/api/production-client.ts",
        "src/lib/api/production-service-client.ts"
    ]

    fixed_files = []

    for filepath in files_to_fix:
        if not os.path.exists(filepath):
            continue

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            original = content

            # Fix common syntax patterns

            # 1. Fix Promise<Type<SubType missing >
            content = re.sub(
                r'Promise<([^<>]+)<([^<>]+)(?!\>)([^>]*)\)',
                r'Promise<\1<\2>>\3)',
                content
            )

            # 2. Fix missing closing parentheses in map/filter
            content = re.sub(
                r'\.map\(([^)]+\})\s*;',
                r'.map(\1);',
                content
            )

            content = re.sub(
                r'\.filter\(([^)]+\})\s*;',
                r'.filter(\1);',
                content
            )

            # 3. Fix missing closing ) in function calls
            content = re.sub(
                r'([a-zA-Z_][a-zA-Z0-9_]*\([^)]*)\s*;(?!\))',
                r'\1);',
                content
            )

            # 4. Fix line 359 in browser-local-ai.ts specifically
            if "browser-local-ai.ts" in filepath:
                # Look for the specific pattern at line 359
                lines = content.split('\n')
                if len(lines) > 358:  # 0-based index
                    line = lines[358]
                    if '});' in line and not line.strip().endswith('}));'):
                        lines[358] = line.replace('});', '}));')
                        content = '\n'.join(lines)

            # 5. Fix langchain-rag.ts lines 291 and 481
            if "langchain-rag.ts" in filepath:
                lines = content.split('\n')
                # Line 291
                if len(lines) > 290:
                    line = lines[290]
                    if '});' in line and not line.strip().endswith('}));'):
                        lines[290] = line.replace('});', '}));')
                # Line 481
                if len(lines) > 480:
                    line = lines[480]
                    if '});' in line and not line.strip().endswith('}));'):
                        lines[480] = line.replace('});', '}));')
                content = '\n'.join(lines)

            # 6. Fix production-service-client.ts line 140 comma issues
            if "production-service-client.ts" in filepath:
                content = re.sub(
                    r'(\w+)\s+(\w+)\s+(\w+)\s+(\w+)\s*;',
                    r'\1, \2, \3, \4;',
                    content
                )

            if content != original:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                fixed_files.append(filepath)

        except Exception as e:
            print(f"Error processing {filepath}: {e}")

    return fixed_files

def fix_all_typescript_files():
    """Apply quick fixes to all TypeScript files"""

    fixed_files = []

    for root, dirs, files in os.walk('src'):
        for file in files:
            if file.endswith('.ts') and not file.endswith('.d.ts'):
                filepath = os.path.join(root, file)

                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()

                    original = content

                    # Quick pattern fixes

                    # 1. Fix Promise generics
                    content = re.sub(
                        r'Promise<([^<>]+)<([^<>]+)(?!\>)',
                        r'Promise<\1<\2>>',
                        content
                    )

                    # 2. Fix array methods missing closing )
                    content = re.sub(
                        r'\.(map|filter|reduce|forEach)\([^)]+\}\s*;',
                        lambda m: m.group(0).replace(';', '));'),
                        content
                    )

                    # 3. Fix missing semicolons after type definitions
                    content = re.sub(
                        r'(type\s+\w+\s*=\s*[^;]+)(?!\;)$',
                        r'\1;',
                        content,
                        flags=re.MULTILINE
                    )

                    # 4. Fix missing semicolons after interface definitions
                    content = re.sub(
                        r'(interface\s+\w+\s*\{[^}]+\})(?!\;)$',
                        r'\1;',
                        content,
                        flags=re.MULTILINE
                    )

                    if content != original:
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.write(content)
                        fixed_files.append(filepath)

                except Exception as e:
                    print(f"Error processing {filepath}: {e}")

    return fixed_files

def main():
    print("Running quick TypeScript syntax fixes...")

    # Fix specific problem files first
    specific_files = fix_specific_files()
    print(f"Fixed specific files: {len(specific_files)}")

    # Apply general fixes
    all_files = fix_all_typescript_files()
    print(f"Applied general fixes to: {len(all_files)} files")

    total_files = set(specific_files + all_files)
    print(f"Total files modified: {len(total_files)}")

    for file in total_files:
        print(f"  - {file}")

if __name__ == "__main__":
    main()