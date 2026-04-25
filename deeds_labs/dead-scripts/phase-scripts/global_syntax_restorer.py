
import os
import re

def fix_content(content):
    # 1. Fix the "prop: type: nextProp" pattern in interfaces/types
    # This transforms "id?: number: sessionId, string: role"
    # into "id?: number; sessionId: string; role"
    content = re.sub(r'(\w+\??)\s*:\s*(number|string|boolean|Date|any|unknown|null)\s*:\s*(\w+)', r'\1: \2; \3', content)

    # 2. Fix "prop, type: nextProp"
    content = re.sub(r'(\w+),\s*(string|number|boolean|Date|any|unknown|null)\s*:\s*(\w+)', r'\1: \2; \3', content)

    # 3. Fix Table<Type: KeyType> -> Table<Type, KeyType>
    content = re.sub(r'Table<(\w+):\s*(\w+)>', r'Table<\1, \2>', content)

    # 4. Fix [key, string], any -> [key: string]: any
    content = re.sub(r'\[key,\s*string\],\s*any', r'[key: string]: any', content)

    # 5. Fix optional chaining hallucinations "? ." -> "?."
    content = re.sub(r'\?\s*\.\s*', r'?.', content)

    # 6. Fix nullish coalescing hallucinations ": |" -> "??"
    content = re.sub(r':\s*\|\s*', r'??', content)

    # 7. Fix Date | $1, Date -> Date
    content = re.sub(r'Date\s*\|\s*\$1,\s*Date', r'Date', content)

    # 8. Fix "callback: (err: type, null: res" patterns
    content = re.sub(r',\s*null:\s*', r', ', content)

    # 9. Fix "prop: { ... } nextProp" where comma/semicolon is missing
    # content = re.sub(r'}\s*(\w+)\s*:', r'}; \1:', content)

    # 10. Fix squashed keywords that might have escaped previous fixes
    keywords = ['return', 'const', 'let', 'if', 'for', 'while', 'switch', 'case', 'break', 'continue', 'export', 'import', 'await', 'async']
    for kw in keywords:
        # Fix ", keyword" -> "; keyword"
        content = re.sub(r',\s*' + kw + r'(\s+)', r'; ' + kw + r'\1', content)
        # Fix "keyword:" if it's not a label (heuristically)
        # content = re.sub(r'^(\s*)' + kw + r':', r'\1' + kw, content, flags=re.MULTILINE)

    # 11. Fix "label: id?:" -> "id: string; label?:"
    content = re.sub(r'id:\s*label\?:', r'id: string; label?:', content)

    # 12. Fix "prop: value, value: nextProp" -> "prop: value; nextProp"
    # This is dangerous so we limit it to known problematic types
    content = re.sub(r':\s*(number|string|boolean|Date|any|unknown|null)\s*,\s*(\w+)\s*:', r': \1; \2:', content)

    # 13. Fix "callback signature with comma instead of semicolon"
    # e.g. "void, subscribeTo"
    content = re.sub(r'void,\s*(\w+)\(', r'void; \1(', content)

    # 14. Fix "{ prop: nextProp: value }" in objects
    # content = re.sub(r'{\s*(\w+):\s*(\w+):', r'{ \1, \2:', content)

    # 15. Fix "null: status?"
    content = re.sub(r'null:\s*(\w+)\?', r'\1?', content)

    return content

def main():
    src_dir = 'src'
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith(('.ts', '.js', '.svelte', '.mts', '.mjs')):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    new_content = fix_content(content)

                    if new_content != content:
                        with open(path, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        # print(f"Fixed {path}")
                except Exception as e:
                    print(f"Error processing {path}: {e}")

if __name__ == '__main__':
    main()
