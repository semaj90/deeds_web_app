#!/usr/bin/env python3
import os
import re
import sys
from pathlib import Path

def convert_svelte_file(filepath):
    """Complete Svelte 5 migration for a single file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    changes = []

    # 1. Convert export let to $props()
    export_lets = re.findall(r'^\s*export\s+let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=\s*([^;]+))?\s*;', content, flags=re.MULTILINE)

    if export_lets:
        changes.append(f"Converting {len(export_lets)} export let statements")

        # Build props destructuring
        props_parts = []
        for prop_name, default_value in export_lets:
            if default_value and default_value.strip():
                props_parts.append(f"{prop_name} = {default_value.strip()}")
            else:
                props_parts.append(prop_name)

        if props_parts:
            props_destructure = f"let {{ {', '.join(props_parts)} }} = $props();"

            # Remove all export let statements
            content = re.sub(r'^\s*export\s+let\s+[^;]+;\s*\n?', '', content, flags=re.MULTILINE)

            # Add props destructuring after script tag
            script_match = re.search(r'(<script[^>]*>)', content)
            if script_match:
                insert_pos = script_match.end()
                content = content[:insert_pos] + f"\n  {props_destructure}\n" + content[insert_pos:]

    # 2. Convert $: reactive statements to $derived()
    reactive_patterns = [
        # Simple assignments: $: variable = expression;
        (r'^\s*\$:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+);', r'  const \1 = $derived(\2);'),
        # With let: $: let variable = expression;
        (r'^\s*\$:\s*let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+);', r'  let \1 = $derived(\2);'),
    ]

    for pattern, replacement in reactive_patterns:
        matches = re.findall(pattern, content, flags=re.MULTILINE)
        if matches:
            changes.append(f"Converting {len(matches)} reactive statements")
            content = re.sub(pattern, replacement, content, flags=re.MULTILINE)

    # 3. Convert $: side effects to $effect()
    side_effect_pattern = r'^\s*\$:\s*([^=;{][^;]*;)'
    side_effects = re.findall(side_effect_pattern, content, flags=re.MULTILINE)
    if side_effects:
        changes.append(f"Converting {len(side_effects)} side effect statements")
        def replace_side_effect(match):
            effect_content = match.group(1).strip()
            if not effect_content.endswith(';'):
                effect_content += ';'
            return f'  $effect(() => {{ {effect_content} }});'
        content = re.sub(side_effect_pattern, replace_side_effect, content, flags=re.MULTILINE)

    # 4. Update createEventDispatcher to modern syntax
    if 'createEventDispatcher' in content:
        changes.append("Converting createEventDispatcher to modern syntax")

        # Replace import
        content = re.sub(
            r'import\s*{\s*([^}]*),?\s*createEventDispatcher\s*([^}]*)\s*}\s*from\s*["\']svelte["\'];',
            r'import { \1 \2 } from "svelte";',
            content
        )
        content = re.sub(
            r'import\s*{\s*createEventDispatcher\s*}\s*from\s*["\']svelte["\'];',
            '',
            content
        )

        # Replace dispatcher creation and usage
        content = re.sub(r'const\s+dispatch\s*=\s*createEventDispatcher\(\);', '', content)
        content = re.sub(r'dispatch\(["\']([^"\']+)["\'],?\s*([^)]*)\)', r'ondispatch?.(\2)', content)

    # 5. Convert stores to $state() where appropriate (basic patterns)
    if 'writable(' in content and '$state' not in content:
        changes.append("Converting writable stores to $state()")
        content = re.sub(r'let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*writable\(([^)]+)\);',
                        r'let \1 = $state(\2);', content)

    # 6. Update component lifecycle
    lifecycle_replacements = [
        (r'onMount\(([^)]+)\)', r'$effect(\1)'),
        (r'beforeUpdate\(([^)]+)\)', r'$effect.pre(\1)'),
        (r'afterUpdate\(([^)]+)\)', r'$effect(\1)'),
    ]

    for pattern, replacement in lifecycle_replacements:
        if re.search(pattern, content):
            changes.append(f"Converting lifecycle: {pattern}")
            content = re.sub(pattern, replacement, content)

    # 7. Update imports to include Svelte 5 runes
    if '$state' in content or '$derived' in content or '$effect' in content:
        if not re.search(r'import.*\$state.*from.*svelte', content):
            # Add runes import
            script_match = re.search(r'(<script[^>]*>)', content)
            if script_match:
                insert_pos = script_match.end()
                content = content[:insert_pos] + f"\n  // Svelte 5 runes are auto-imported\n" + content[insert_pos:]

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return changes
    return []

def main():
    """Migrate entire codebase to Svelte 5"""
    total_files = 0
    converted_files = 0
    total_changes = []

    print("Starting comprehensive Svelte 5 migration...")

    # Find all Svelte files
    for root, dirs, files in os.walk('src'):
        for file in files:
            if file.endswith('.svelte'):
                filepath = os.path.join(root, file)
                total_files += 1

                try:
                    changes = convert_svelte_file(filepath)
                    if changes:
                        converted_files += 1
                        print(f"[OK] {filepath}")
                        for change in changes:
                            print(f"   - {change}")
                        total_changes.extend(changes)

                except Exception as e:
                    print(f"[ERROR] Error processing {filepath}: {e}")

    # Summary
    print(f"\n[SUMMARY] Migration Summary:")
    print(f"   Total Svelte files: {total_files}")
    print(f"   Files converted: {converted_files}")
    print(f"   Total changes: {len(total_changes)}")

    print(f"\n[COMPLETE] Svelte 5 migration completed!")
    print(f"   Run 'npm run check' to verify the migration")

if __name__ == "__main__":
    main()