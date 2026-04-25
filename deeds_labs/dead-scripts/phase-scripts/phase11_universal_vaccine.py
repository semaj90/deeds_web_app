
import os

def fix_corruption(file_path):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    new_content = content

    # 1. Fix `;,` -> `;`
    # This was a newline replacement corruption.
    new_content = new_content.replace(';,', ';')

    # 2. Fix `{,` -> `{`
    # This was a newline or open-brace corruption.
    new_content = new_content.replace('{,', '{')

    # 3. Fix `,}` -> `}`
    # Sometimes closing braces might be affected (seen less often but possible)
    # Actually I haven't seen this in logs, but keep it in mind.
    # The logs show `stats: {, activeCases: ...`, so `{,` is the main culprit.

    if content != new_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

def main():
    targets = [
        'src/routes',
        'src/lib',
        'src/mcp',
        'src/wasm'
    ]

    count = 0
    for target in targets:
        if not os.path.exists(target):
            continue

        for root, dirs, files in os.walk(target):
            for file in files:
                if file.endswith(('.svelte', '.ts', '.js', '.json')):
                    path = os.path.join(root, file)
                    if fix_corruption(path):
                        print(f"Fixed: {path}")
                        count += 1

    print(f"🎉 Universal Vaccine complete. Fixed {count} files.")

if __name__ == '__main__':
    main()
