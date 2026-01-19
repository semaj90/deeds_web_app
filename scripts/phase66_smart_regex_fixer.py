import os
import re
import argparse

# Configuration
extensions = ['.ts', '.js', '.svelte']
root_dir = r"c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src"

# Targeted keys that are highly likely to be object properties
# If found followed by a comma instead of colon, we fix them.
targeted_keys = [
    'success', 'error', 'status', 'message', 'data', 'code', 'type', 'mode',
    'timestamp', 'query', 'initialMode', 'analysis', 'confidence', 'summary',
    'details', 'lastSeen', 'count', 'severity', 'resultType', 'responseTime',
    'originalSize', 'compressedSize', 'compressionRatio', 'userId', 'sessionId',
    'typing', 'lastActivity', 'currentFocus', 'analytics', 'layout', 'autosave',
    'isSupported', 'parseTimeMs', 'backend', 'initStatus', 'vector', 'limit',
    'filter', 'score', 'payload', 'matches', 'indices', 'value', 'key', 'start',
    'end', 'systemPrompt', 'temperature', 'topP', 'topK', 'repeatPenalty',
    'agents', 'maxRounds', 'context', 'crewId', 'taskId', 'endpoint', 'retries',
    'timeout', 'metadata'
]

# Regex patterns
# 1. Targeted keys: `success, ...` -> `success: ...`
# Matches: Start of line OR after { (Object start)
# Group 1: Prefix (Indentation or spaces after {)
# Group 2: Key
targeted_keys_pattern = re.compile(
    r'(?m)(^[\t ]*|(?<=\{)\s*)(' + '|'.join(targeted_keys) + r')\s*,\s+(?=[^,\s])'
)

# 4. Inline Targeted Keys: `prop: val, key, val2` -> `... key: val2`
# Matches a key preceded by a simple property assignment (context)
# Group 1: Preceding context (e.g., ": 123, ")
# Group 2: Key
inline_targeted_keys_pattern = re.compile(
    r'((?::\s*(?:true|false|null|\d+|"[^"]*"|\'[^\']*\')\s*,\s*))(' + '|'.join(targeted_keys) + r')\s*,\s+(?=[^,\s])'
)

# 2. Key-Literal pattern: `key, "value"` -> `key: "value"`
# Matches keys followed by comma and a literal value (string, number, boolean)
# Restrict to lines usually inside objects (heuristic?)
# We keep it safe by requiring the value to be a distinct literal.
literal_value_pattern = re.compile(
    r'(?m)^\s*(\w+)\s*,\s*(true|false|null|\d+|"[^"]*"|\'[^\']*\')\s*(,)?$'
)

# 3. `query.response` fix -> `query: response`
# Matches `identifier.identifier` at end of line or before comma
dot_property_pattern = re.compile(
    r'(?m)^\s*(\w+)\.(\w+)\s*(,)?$'
)

def fix_content(content):
    original_content = content

    # 1. Fix Targeted Keys (Preserve indentation)
    # Replace "indent + key, " with "indent + key: "
    content = targeted_keys_pattern.sub(r'\1\2: ', content)

    # 4. Fix Inline Targeted Keys
    # Replace "context + key, " with "context + key: "
    content = inline_targeted_keys_pattern.sub(r'\1\2: ', content)

    # 2. Fix Key-Literal
    # Replace "key, value" with "key: value"
    # Group 1 is key, Group 2 is value, Group 3 is optional comma
    content = literal_value_pattern.sub(r'\1: \2\3', content)

    # 3. Fix Dot Property
    # `query.response,` -> `query: response,`
    content = dot_property_pattern.sub(r'\1: \2\3', content)

    return content

def main():
    parser = argparse.ArgumentParser(description="Phase 66: Smart Regex Fixer")
    parser.add_argument('--apply', action='store_true', help="Apply changes to files")
    args = parser.parse_args()

    files_touched = 0
    total_files = 0

    print(f"🔍 Scanning {root_dir}...")

    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if any(file.endswith(ext) for ext in extensions):
                total_files += 1
                path = os.path.join(root, file)

                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    new_content = fix_content(content)

                    if new_content != content:
                        files_touched += 1
                        print(f"📝 {file} needs fixing")

                        # Show diff sample
                        lines = content.split('\n')
                        new_lines = new_content.split('\n')
                        for i, (l1, l2) in enumerate(zip(lines, new_lines)):
                            if l1 != l2:
                                print(f"  - {l1.strip()}")
                                print(f"  + {l2.strip()}")
                                if i > 5: # Limit diff output per file
                                    print("  ...")
                                    break

                        if args.apply:
                            with open(path, 'w', encoding='utf-8') as f:
                                f.write(new_content)
                            print(f"  ✅ Fixed")

                except Exception as e:
                    print(f"⚠️ Error reading {path}: {e}")

    print("-" * 30)
    print(f"Total files scanned: {total_files}")
    print(f"Files requiring fixes: {files_touched}")

    if not args.apply and files_touched > 0:
        print("\n📢 Run with --apply to execute these changes.")

if __name__ == "__main__":
    main()
