import os
import re

def fix_imports(directory):
    count = 0
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.ts') or file.endswith('.svelte') or file.endswith('.js'):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    # Fix './$types ' -> './$types'
                    new_content = re.sub(r"from '\./\$types\s+'", "from './$types'", content)
                    # Fix './$types .js' -> './$types.js'
                    new_content = re.sub(r"from '\./\$types\s+\.js'", "from './$types.js'", new_content)
                    # Fix './$types ' (generic)
                    new_content = re.sub(r"from '\./\$types\s+'", "from './$types'", new_content)

                    if content != new_content:
                        with open(path, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        print(f"Fixed {path}")
                        count += 1
                except Exception as e:
                    print(f"Error processing {path}: {e}")
    print(f"Total files fixed: {count}")

if __name__ == "__main__":
    fix_imports('src/routes')
