import os
import re

# Vaccine Cleanup: Recursively repair all mashed files in src/
# Safe regex-based replacement for known corruption patterns.

TARGET_DIRS = [
    "src/routes/(app)",
    "src/lib",
    "src/routes/admin", # Re-scan admins just in case
    "src/routes/acp"    # Re-scan acp
]

EXTENSIONS = [".svelte", ".ts"]

def repair_content(content):
    original_len = len(content)

    # Fix 1: Semicolon + Comma -> Semicolon + Newline + Tab (heuristic indentation)
    # Matches: "width: 100%;, height: 100%;" -> "width: 100%;\n\theight: 100%;"
    # Matches: "id: string;, role: string;" -> "id: string;\n\trole: string;"
    content = re.sub(r';,\s*', ';\n\t', content)

    # Fix 2: Open Brace + Comma -> Open Brace + Newline + Tab
    # Matches: "general: {, theme: 'yorha'" -> "general: {\n\ttheme: 'yorha'"
    content = re.sub(r'{\s*,\s*', '{\n\t', content)

    # Fix 3: Typos like ":,"
    # Matches: "let { data }: {, data: PageData }" -> "let { data }: {\n\tdata: PageData }"
    content = re.sub(r':,\s*', ':\n\t', content)

    # Fix 4: "}, key" -> "},\n\tkey"
    # Matches: "}, ai: {" -> "},\n\tai: {"
    content = re.sub(r'},\s*', '},\n\t', content)

    return content

def process_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Only write if matches found to avoid touching timestamps unnecessarily,
        # but efficient regex is fast enough.

        # Check if corruption exists before modifying
        if ";," in content or "{," in content or ":," in content or "}," in content:
            new_content = repair_content(content)

            if new_content != content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"✅ Repaired: {file_path}")
                return True
    except Exception as e:
        print(f"❌ Error processing {file_path}: {e}")

    return False

def main():
    count = 0
    for root_dir in TARGET_DIRS:
        if not os.path.exists(root_dir):
            print(f"⚠️ Directory not found: {root_dir}")
            continue

        for root, _, files in os.walk(root_dir):
            for file in files:
                if any(file.endswith(ext) for ext in EXTENSIONS):
                    file_path = os.path.join(root, file)
                    if process_file(file_path):
                        count += 1

    print(f"\n🎉 Total files repaired: {count}")

if __name__ == "__main__":
    main()
