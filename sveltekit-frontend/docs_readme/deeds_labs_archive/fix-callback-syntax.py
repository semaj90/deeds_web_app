#!/usr/bin/env python3
import os
import re

def fix_callback_syntax():
    """Fix malformed callback syntax in specific files"""

    # Files to fix
    files_to_fix = [
        "src/lib/components/TagList.svelte",
        "src/lib/components/ai/AIChatInput.svelte"
    ]

    fixed_files = []

    for filepath in files_to_fix:
        if not os.path.exists(filepath):
            continue

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content

        # Fix malformed callback patterns like onFn?.()param)
        content = re.sub(r'(\w+)\?\.\(\)([^)]+)\)', r'\1?.(\2)', content)

        # Fix double closing parentheses ?.());
        content = re.sub(r'\?\.\(\)\)', r'?.()', content)

        # Fix container class structure
        if "TagList.svelte" in filepath:
            content = re.sub(
                r'<div class="tag-component" class:readonly>\s*<div class="tag-component">',
                '<div class="tag-list" class:readonly>\n  <div class="tag-container">',
                content
            )
            # Fix Tag icon class
            content = re.sub(
                r'<Tag class="tag-component"',
                '<Tag',
                content
            )

        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            fixed_files.append(filepath)

    return fixed_files

if __name__ == "__main__":
    print("Fixing callback syntax errors...")
    fixed_files = fix_callback_syntax()

    print(f"Fixed callback syntax in {len(fixed_files)} files:")
    for file in fixed_files:
        print(f"  - {file}")

    print("Callback syntax fixes completed!")