#!/usr/bin/env python3
import os
import re

def convert_event_dispatchers(filepath):
    """Convert createEventDispatcher to modern Svelte 5 patterns"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    changes = []

    if 'createEventDispatcher' in content:
        changes.append("Converting createEventDispatcher")

        # Remove createEventDispatcher import
        content = re.sub(
            r'import\s*{\s*([^}]*,\s*)?createEventDispatcher\s*(,\s*[^}]*)?\s*}\s*from\s*["\']svelte["\'];',
            lambda m: f'import {{ {(m.group(1) or "").strip(",").strip()} {(m.group(2) or "").strip(",").strip()} }} from "svelte";' if (m.group(1) or m.group(2)) else '',
            content
        )

        # Remove standalone createEventDispatcher import
        content = re.sub(r'import\s*{\s*createEventDispatcher\s*}\s*from\s*["\']svelte["\'];\s*', '', content)

        # Remove dispatcher creation
        content = re.sub(r'const\s+dispatch\s*=\s*createEventDispatcher\(\);\s*', '', content)

        # Convert dispatch calls to callback props
        # dispatch('eventName', data) -> onEventName?.(data)
        def replace_dispatch(match):
            event_name = match.group(1).strip('\'"')
            data_part = match.group(2)

            # Convert event name to callback prop name
            callback_name = 'on' + event_name[0].upper() + event_name[1:]

            if data_part and data_part.strip():
                return f'{callback_name}?.({data_part.strip()})'
            else:
                return f'{callback_name}?.()'

        content = re.sub(r'dispatch\(["\']([^"\']+)["\'](?:,\s*([^)]*))?\)', replace_dispatch, content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return changes
    return []

def main():
    """Convert all createEventDispatcher patterns"""
    total_files = 0
    converted_files = 0

    print("Converting createEventDispatcher patterns to Svelte 5...")

    for root, dirs, files in os.walk('src'):
        for file in files:
            if file.endswith('.svelte'):
                filepath = os.path.join(root, file)
                total_files += 1

                try:
                    changes = convert_event_dispatchers(filepath)
                    if changes:
                        converted_files += 1
                        print(f"Converted: {filepath}")
                        for change in changes:
                            print(f"   - {change}")

                except Exception as e:
                    print(f"Error processing {filepath}: {e}")

    print(f"\nConversion Summary:")
    print(f"   Total Svelte files: {total_files}")
    print(f"   Files converted: {converted_files}")

if __name__ == "__main__":
    main()