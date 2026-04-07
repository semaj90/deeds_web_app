#!/usr/bin/env python3
import os
import re
import sys

def convert_reactive_statements(filepath):
    """Convert Svelte 4 reactive statements to Svelte 5 $derived runes"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Pattern 1: Simple reactive assignments: $: variable = expression;
    # Convert to: const variable = $derived(expression);
    pattern1 = r'^\s*\$:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+);'
    replacement1 = r'  const \1 = $derived(\2);'
    content = re.sub(pattern1, replacement1, content, flags=re.MULTILINE)

    # Pattern 2: Reactive statements with let: $: let variable = expression;
    # Convert to: let variable = $derived(expression);
    pattern2 = r'^\s*\$:\s*let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+);'
    replacement2 = r'  let \1 = $derived(\2);'
    content = re.sub(pattern2, replacement2, content, flags=re.MULTILINE)

    # Pattern 3: Complex reactive blocks: $: { ... }
    # These need manual review, but we can flag them
    complex_reactive = re.findall(r'^\s*\$:\s*\{', content, flags=re.MULTILINE)
    if complex_reactive:
        print(f"  Warning: {len(complex_reactive)} complex reactive blocks in {filepath} need manual review")

    # Pattern 4: Reactive statements with side effects: $: console.log(...)
    # Convert to: $effect(() => { console.log(...); });
    pattern4 = r'^\s*\$:\s*([^=;{]+;)'

    def replace_side_effect(match):
        effect_content = match.group(1).strip()
        if not effect_content.endswith(';'):
            effect_content += ';'
        return f'  $effect(() => {{ {effect_content} }});'

    content = re.sub(pattern4, replace_side_effect, content, flags=re.MULTILINE)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def convert_export_let(filepath):
    """Convert export let to $props() syntax"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Find export let statements and collect them
    export_lets = re.findall(r'^\s*export\s+let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=\s*([^;]+))?\s*;', content, flags=re.MULTILINE)

    if export_lets:
        print(f"  Found {len(export_lets)} export let statements in {filepath}")

        # Build props interface and destructuring
        props_interface = "interface Props {\n"
        props_destructure = "let {\n"

        for prop_name, default_value in export_lets:
            if default_value:
                props_interface += f"    {prop_name}?: any;\n"
                props_destructure += f"    {prop_name} = {default_value},\n"
            else:
                props_interface += f"    {prop_name}: any;\n"
                props_destructure += f"    {prop_name},\n"

        props_interface += "  }"
        props_destructure += "  }: Props = $props();"

        # Remove all export let statements
        content = re.sub(r'^\s*export\s+let\s+[^;]+;\s*\n', '', content, flags=re.MULTILINE)

        # Add props interface and destructuring after the script tag
        script_match = re.search(r'(<script[^>]*>)', content)
        if script_match:
            insert_pos = script_match.end()
            new_props = f"\n  {props_interface}\n\n  {props_destructure}\n"
            content = content[:insert_pos] + new_props + content[insert_pos:]

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    fixed_reactive = 0
    fixed_props = 0
    total_files = 0

    for root, dirs, files in os.walk('src'):
        for file in files:
            if file.endswith('.svelte'):
                filepath = os.path.join(root, file)
                total_files += 1

                try:
                    # Convert reactive statements
                    if convert_reactive_statements(filepath):
                        fixed_reactive += 1
                        print(f"Converted reactive statements: {filepath}")

                    # Convert export let to props
                    if convert_export_let(filepath):
                        fixed_props += 1
                        print(f"Converted export let to props: {filepath}")

                except Exception as e:
                    print(f"Error processing {filepath}: {e}")

    print(f"\nProcessed {total_files} Svelte files")
    print(f"Fixed reactive statements in {fixed_reactive} files")
    print(f"Fixed export let in {fixed_props} files")

if __name__ == "__main__":
    main()