import os
import re

# Batch 9: Regex-based repair for remaining mashed files
# Targets: agentic-errors, phase78 monitor/patches, global-search

files_to_repair = [
    "src/routes/(app)/agentic-errors/+page.svelte",
    "src/routes/(app)/phase78/monitor/+page.svelte",
    "src/routes/(app)/phase78/patches/+page.svelte",
    "src/routes/(app)/global-search/+page.svelte"
]

def repair_content(content):
    # Fix 1: Semicolon then comma -> Semicolon then newline
    # css: display: flex;, gap: 1rem; -> display: flex;\n gap: 1rem;
    # ts: id: string;, role: string; -> id: string;\n role: string;
    content = re.sub(r';,\s*', ';\n', content)

    # Fix 2: Open brace then comma -> Open brace then newline (for objects)
    # general: {, theme: 'yorha' -> general: {\n theme: 'yorha'
    content = re.sub(r'{\s*,\s*', '{\n', content)

    # Fix 3: CSS specific mashed lines (if any remain that use semicolons but no comma)
    # This is risky, relying on pattern 1 mostly.

    # Fix 4: Comma then property assignment in objects?
    # e.g. theme: 'yorha',, language: 'en' -> theme: 'yorha',\n language: 'en'
    # Checking for ,,
    content = re.sub(r',\s*,\s*', ',\n', content)

    # Fix 5: Typo in analysis-center "let { data }: {, data: PageData }"
    # This matches Fix 2.

    return content

for file_path in files_to_repair:
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            new_content = repair_content(content)

            if new_content != content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"✅ Repaired: {file_path}")
            else:
                print(f"⚠️  No changes needed for: {file_path}")
        else:
            print(f"❌ File not found: {file_path}")

    except Exception as e:
        print(f"❌ Error fixing {file_path}: {str(e)}")
