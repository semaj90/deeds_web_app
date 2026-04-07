#!/usr/bin/env python3
import os
import re
from pathlib import Path

def fix_svelte_syntax_errors():
    """Fix critical Svelte syntax errors causing TS1005 issues"""

    fixed_files = []

    # 1. Fix AIChatInput.svelte debounce syntax error
    ai_chat_input = "src/lib/components/ai/AIChatInput.svelte"
    if os.path.exists(ai_chat_input):
        with open(ai_chat_input, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content

        # Fix debounce call syntax error
        content = re.sub(
            r'oninput=\{\(event: Event\) => debounce\(handleInput, 300\}',
            r'oninput={(event: Event) => debounce(handleInput, 300)}',
            content
        )

        # Fix onclick malformed syntax
        content = re.sub(
            r'onclick=\{\(event: MouseEvent\) => \) => handleSend\(\}',
            r'onclick={(event: MouseEvent) => handleSend()}',
            content
        )

        # Fix value.trim.length (missing parentheses)
        content = re.sub(
            r'value\.trim\.length',
            r'value.trim().length',
            content
        )

        if content != original:
            with open(ai_chat_input, 'w', encoding='utf-8') as f:
                f.write(content)
            fixed_files.append(ai_chat_input)

    # 2. Fix TagList.svelte structure
    tag_list = "src/lib/components/TagList.svelte"
    if os.path.exists(tag_list):
        with open(tag_list, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content

        # Remove migration error comments
        content = re.sub(
            r'<!-- @migration-task Error while migrating Svelte code: Unterminated string constant[\s\S]*?-->',
            '',
            content,
            flags=re.MULTILINE
        )

        # Fix the broken class structure - restore proper TagList component
        content = re.sub(
            r'<div class="tag-list" class:readonly>\s*<div class="tag-component">',
            '<div class="tag-list" class:readonly>\n  <div class="tag-container">',
            content
        )

        # Fix tag container structure
        content = re.sub(
            r'<div class="tag-component" transition:scale>',
            '<div class="tag" transition:scale>\n        <span class="tag-text">{tag}</span>',
            content
        )

        # Fix button class
        content = re.sub(
            r'class="tag-component"\s*onclick=\{\(\) => removeTag\(tag\)\}',
            'class="tag-remove"\n            onclick={() => removeTag(tag)}',
            content
        )

        # Fix input container
        content = re.sub(
            r'<div class="tag-component" bind:this=\{suggestionsContainer\}>',
            '<div class="tag-input-container" bind:this={suggestionsContainer}>',
            content
        )

        # Fix input class
        content = re.sub(
            r'class="tag-component"\s*type="text"',
            'class="tag-input"\n          type="text"',
            content
        )

        # Fix suggestions container
        content = re.sub(
            r'<div class="tag-component" role="listbox">',
            '<div class="suggestions" role="listbox">',
            content
        )

        # Fix suggestion buttons
        content = re.sub(
            r'class="tag-component"\s*class:active=\{index === activeIndex\}',
            'class="suggestion"\n                class:active={index === activeIndex}',
            content
        )

        # Fix custom tag button
        content = re.sub(
            r'class="tag-component"\s*onclick=\{\(\) => addTag\(inputValue\)\}',
            'class="add-custom-tag"\n        onclick={() => addTag(inputValue)}',
            content
        )

        # Fix max tags message
        content = re.sub(
            r'<div class="tag-component" role="status"',
            '<div class="max-tags-message" role="status"',
            content
        )

        if content != original:
            with open(tag_list, 'w', encoding='utf-8') as f:
                f.write(content)
            fixed_files.append(tag_list)

    # 3. Fix any remaining missing event handler declarations in Svelte files
    for root, dirs, files in os.walk('src'):
        for file in files:
            if file.endswith('.svelte'):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()

                    original = content

                    # Fix missing event handler function references
                    content = re.sub(
                        r'(on\w+)\?\.\(',
                        r'\1?.()',
                        content
                    )

                    # Fix malformed onclick handlers
                    content = re.sub(
                        r'onclick=\{[^}]*\)\s*=>\s*\)\s*=>[^}]*\}',
                        lambda m: 'onclick={() => handleClick()}',
                        content
                    )

                    if content != original:
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.write(content)
                        if filepath not in fixed_files:
                            fixed_files.append(filepath)

                except Exception as e:
                    print(f"Warning: Could not process {filepath}: {e}")

    return fixed_files

if __name__ == "__main__":
    print("Fixing critical Svelte syntax errors...")

    # Change to frontend directory
    os.chdir(".")

    fixed_files = fix_svelte_syntax_errors()

    print(f"Fixed syntax errors in {len(fixed_files)} files:")
    for file in fixed_files:
        print(f"  - {file}")

    print("Svelte syntax error fixes completed!")