#!/usr/bin/env python3
import os
import re

# Match lines where a comment swallows the next field definition
# source: ..., // ..., createdAt: timestamp(...)
# .default(...)

TARGET_FILE = "src/lib/server/db/schema-postgres.ts"

def repair_schema():
    if not os.path.exists(TARGET_FILE):
        print(f"File not found: {TARGET_FILE}")
        return

    with open(TARGET_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to find the corrupted comment merging
    # Group 1: The field BEFORE the comment
    # Group 2: The stuff inside the comment that SHOULD be code

    # Example: field: type(...), // comment, newField: type(...)
    pattern = re.compile(r'(\s*[a-zA-Z0-9_]+:\s*[^,]+,\s*)\/\/\s*(.*)(,\s*[a-zA-Z0-9_]+:\s*timestamp.*)')

    # This is tricky because the comma and field name are inside the comment text effectively?
    # Actually, in the file view:
    # addedBy: varchar('added_by', { length: 50 }).default('user'), // 'system', 'user', createdAt: timestamp('created_at', { withTimezone: true })

    # So we want to split at the comma before `createdAt`

    def replacer(match):
        # We need to move the `createdAt` part to a new line and remove it from the comment
        full_line = match.group(0)

        # Split by `//`
        parts = full_line.split('//')
        pre_comment = parts[0]
        post_comment = parts[1] if len(parts) > 1 else ""

        # Find where the actual code starts again inside the comment
        # Look for `, k: v` pattern
        # The specific pattern seems to be `, createdAt:`

        if ', createdAt:' in post_comment:
            comment_text, code_text = post_comment.split(', createdAt:', 1)
            return f"{pre_comment}//{comment_text}\n  createdAt:{code_text}"

        return full_line

    # Iterative replacement line by line might be safer
    lines = content.split('\n')
    new_lines = []
    fixed_count = 0

    for line in lines:
        if '//' in line and ', createdAt: timestamp' in line:
            parts = line.split('//')
            pre = parts[0]
            rest = parts[1]

            if ', createdAt: timestamp' in rest:
                comment_part, code_part = rest.split(', createdAt: timestamp', 1)
                new_line = f"{pre}//{comment_part}\n  createdAt: timestamp{code_part}"
                new_lines.append(new_line)
                fixed_count += 1
                continue

        new_lines.append(line)

    with open(TARGET_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines))

    print(f"Fixed {fixed_count} corrupted lines in {TARGET_FILE}")

if __name__ == "__main__":
    repair_schema()
