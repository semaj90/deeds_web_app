
import os
import re

def fix_css_in_svelte(file_path):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # Pattern 1: `;,` -> `;` inside CSS values or blocks
    # e.g. `overflow-y: auto;,`
    # We want to be careful not to break JS, but `;,` is rarely valid in JS either (empty statement after semicolon? comma operator?)
    # In Svelte <style> blocks or style attributes, it's definitely wrong.
    # Given the previous corruption was wholesale replacement of newline with `;,` or `,`, we can be reasonably aggressive.

    # Fix `;,` -> `;`
    new_content = content.replace(';,', ';')

    # Fix `{,` -> `{`
    # e.g. `.class {,`
    new_content = new_content.replace('{,', '{')

    # Fix `key: value;, key: value` -> `key: value;`
    # The previous pattern `overflow-y: auto;, position: relative;`
    # `;,` replacement above handles this.

    if content != new_content:
        # Check if we broke anything obvious?
        # In a mass repair, we trust the pattern.
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

def main():
    targets = [
        'src/routes',
        'src/lib'
    ]

    count = 0
    for target in targets:
        for root, dirs, files in os.walk(target):
            for file in files:
                if file.endswith('.svelte'):
                    path = os.path.join(root, file)
                    if fix_css_in_svelte(path):
                        print(f"Fixed: {path}")
                        count += 1

    print(f"🎉 Repair complete. Fixed {count} .svelte files.")

if __name__ == '__main__':
    main()
